import csv
import io

import pytest

from tests.conftest import add_guest


@pytest.fixture
def jo(api, wedding, day, evening):
    guest = add_guest(
        api,
        wedding,
        "Jo",
        email="jo@example.com",
        invitations=[
            {"event_id": day["id"], "plus_one_allowed": True},
            {"event_id": evening["id"], "plus_one_allowed": False},
        ],
    )
    api.post(
        f"/weddings/{wedding['id']}/events/{day['id']}/invitations/mark-sent",
        json={"guest_ids": [guest["id"]]},
    )
    return guest


def rsvp(client, token, **body):
    return client.post(f"/api/v1/public/rsvp/{token}", json=body)


def test_guest_only_sees_invitations_that_were_sent(client, api, wedding, evening, jo):
    view = client.get(f"/api/v1/public/rsvp/{jo['rsvp_token']}").json()
    assert view["first_name"] == "Jo"
    assert view["couple_names"] == "Sam & Alex"
    assert [e["name"] for e in view["events"]] == ["Wedding Day"]
    card_text = " ".join(layer.get("text", "") for layer in view["events"][0]["card"]["layers"])
    assert "Jo Guest" in card_text
    assert view["fonts"]

    api.post(
        f"/weddings/{wedding['id']}/events/{evening['id']}/invitations/mark-sent",
        json={"guest_ids": [jo["id"]]},
    )
    view = client.get(f"/api/v1/public/rsvp/{jo['rsvp_token']}").json()
    assert [e["name"] for e in view["events"]] == ["Wedding Day", "Evening Reception"]


def test_rsvp_with_plus_one(client, api, wedding, day, jo):
    view = rsvp(
        client,
        jo["rsvp_token"],
        responses=[
            {
                "event_id": day["id"],
                "attending": True,
                "plus_one_attending": True,
                "plus_one_name": "Pat",
                "plus_one_dietary": "Vegetarian",
            }
        ],
        dietary_requirements="No nuts",
        message="Can't wait!",
    ).json()
    event = view["events"][0]
    assert (event["rsvp_status"], event["plus_one_name"]) == ("attending", "Pat")
    assert view["has_responded"] and view["dietary_requirements"] == "No nuts"

    summary = api.get(f"/weddings/{wedding['id']}/events/{day['id']}/replies/summary").json()
    assert summary["attending"] == 1
    assert summary["confirmed_headcount"] == 2
    assert {d["requirements"] for d in summary["dietary"]} == {"No nuts", "Vegetarian"}

    # Changing their mind clears the plus-one.
    view = rsvp(
        client, jo["rsvp_token"], responses=[{"event_id": day["id"], "attending": False}]
    ).json()
    assert view["events"][0]["rsvp_status"] == "declined"
    assert view["events"][0]["plus_one_name"] is None


def test_rsvp_validation(client, wedding, day, evening, jo, api):
    api.post(
        f"/weddings/{wedding['id']}/events/{evening['id']}/invitations/mark-sent",
        json={"guest_ids": [jo["id"]]},
    )
    no_plus_one = rsvp(
        client,
        jo["rsvp_token"],
        responses=[{"event_id": evening["id"], "attending": True, "plus_one_attending": True}],
    )
    assert no_plus_one.status_code == 400

    other = api.post(
        f"/weddings/{wedding['id']}/events", expected=201, json={"name": "Brunch", "kind": "other"}
    ).json()
    not_invited = rsvp(
        client, jo["rsvp_token"], responses=[{"event_id": other["id"], "attending": True}]
    )
    assert not_invited.status_code == 400

    assert client.get("/api/v1/public/rsvp/unknown-token").status_code == 404


def test_couple_can_record_replies_manually(api, wedding, day, jo):
    url = f"/weddings/{wedding['id']}/events/{day['id']}/replies"
    row = api.put(
        f"{url}/{jo['id']}",
        json={
            "rsvp_status": "attending",
            "plus_one_attending": False,
            "dietary_requirements": "Coeliac",
        },
    ).json()
    assert row["response_channel"] == "manual"
    assert row["engagement"] == "responded"
    assert row["dietary_requirements"] == "Coeliac"

    assert [r["full_name"] for r in api.get(url, params={"status": "attending"}).json()] == [
        "Jo Guest"
    ]
    reset = api.put(f"{url}/{jo['id']}", json={"rsvp_status": "pending"}).json()
    assert reset["responded_at"] is None

    exported = api.get(f"{url}/export")
    rows = list(csv.DictReader(io.StringIO(exported.text)))
    assert rows[0]["name"] == "Jo Guest" and rows[0]["rsvp"] == "pending"


def test_wedding_summary(api, wedding, day, evening, jo):
    add_guest(api, wedding, "Nomail", invitations=[{"event_id": evening["id"]}])
    summary = api.get(f"/weddings/{wedding['id']}/summary").json()
    assert summary["guests_total"] == 2
    assert summary["guests_without_email"] == 1
    by_event = {e["event_name"]: e for e in summary["events"]}
    assert by_event["Wedding Day"]["invited"] == 1
    assert by_event["Wedding Day"]["invites_sent"] == 1
    assert by_event["Evening Reception"]["invited"] == 2
    assert by_event["Evening Reception"]["potential_headcount"] == 2


def test_exports_defuse_spreadsheet_formulas(client, api, wedding, day, jo):
    rsvp(
        client,
        jo["rsvp_token"],
        responses=[{"event_id": day["id"], "attending": True}],
        message='=HYPERLINK("http://evil.example","click")',
    )
    exported = api.get(f"/weddings/{wedding['id']}/events/{day['id']}/replies/export").text
    row = next(csv.DictReader(io.StringIO(exported)))
    assert row["message"].startswith("'=HYPERLINK")
