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


def test_guest_can_put_an_event_in_their_calendar(client, api, wedding, day, jo):
    """The invitation offers a calendar entry with the reminders the page promises."""
    api.patch(
        f"/weddings/{wedding['id']}/events/{day['id']}",
        json={
            "starts_at": "2027-06-12T14:00:00",
            "ends_at": "2027-06-12T23:30:00",
            "venue_name": "The Old Barn",
            "venue_address": "Wilton, Wiltshire",
        },
    )
    view = client.get(f"/api/v1/public/rsvp/{jo['rsvp_token']}").json()
    links = view["events"][0]["calendar"]
    assert links["ics_url"] == (
        f"https://app.test/api/v1/public/rsvp/{jo['rsvp_token']}/calendar.ics?event={day['id']}"
    )
    assert "dates=20270612T140000%2F20270612T233000" in links["google_url"]
    assert "startdt=2027-06-12T14%3A00%3A00" in links["outlook_url"]
    assert "enddt=2027-06-12T23%3A30%3A00" in links["outlook_url"]

    download = client.get(links["ics_url"])
    assert download.status_code == 200
    assert download.headers["content-type"].startswith("text/calendar")
    assert 'filename="wedding-day.ics"' in download.headers["content-disposition"]
    body = download.text
    assert body.startswith("BEGIN:VCALENDAR\r\n")
    assert body.count("BEGIN:VEVENT") == 1
    assert "DTSTART:20270612T140000" in body
    assert "DTEND:20270612T233000" in body
    assert "SUMMARY:Sam & Alex — Wedding Day" in body
    assert "LOCATION:The Old Barn\\, Wilton\\, Wiltshire" in body
    assert "DESCRIPTION:" in body
    assert body.count("BEGIN:VALARM") == 3
    assert "TRIGGER:-P7D" in body and "TRIGGER:-P1D" in body and "TRIGGER:-PT2H" in body

    # The UID is stable, so a second download updates the entry instead of adding another.
    uids = [line for line in body.splitlines() if line.startswith("UID:")]
    again = client.get(links["ics_url"]).text
    assert [line for line in again.splitlines() if line.startswith("UID:")] == uids


def test_calendar_file_covers_the_wedding_and_drops_declined_events(
    client, api, wedding, day, evening, jo
):
    api.post(
        f"/weddings/{wedding['id']}/events/{evening['id']}/invitations/mark-sent",
        json={"guest_ids": [jo["id"]]},
    )
    rsvp(client, jo["rsvp_token"], responses=[{"event_id": day["id"], "attending": True}])
    whole = client.get(f"/api/v1/public/rsvp/{jo['rsvp_token']}/calendar.ics")
    assert whole.status_code == 200
    assert 'filename="wedding.ics"' in whole.headers["content-disposition"]
    assert whole.text.count("BEGIN:VEVENT") == 2
    assert "Wedding Day" in whole.text and "Evening Reception" in whole.text

    rsvp(
        client,
        jo["rsvp_token"],
        responses=[
            {"event_id": day["id"], "attending": True},
            {"event_id": evening["id"], "attending": False},
        ],
    )
    after = client.get(f"/api/v1/public/rsvp/{jo['rsvp_token']}/calendar.ics").text
    assert after.count("BEGIN:VEVENT") == 1
    assert "Wedding Day" in after and "Evening Reception" not in after


def test_an_event_without_a_time_becomes_an_all_day_entry(client, api, wedding, jo):
    blessing = api.post(
        f"/weddings/{wedding['id']}/events",
        expected=201,
        json={"name": "Blessing", "kind": "day"},
    ).json()
    bo = add_guest(api, wedding, "Bo", invitations=[{"event_id": blessing["id"]}])
    api.post(
        f"/weddings/{wedding['id']}/events/{blessing['id']}/invitations/mark-sent",
        json={"guest_ids": [bo["id"]]},
    )
    body = client.get(
        f"/api/v1/public/rsvp/{bo['rsvp_token']}/calendar.ics?event={blessing['id']}"
    ).text
    # The wedding date, as an all-day entry: DTEND is the day after, per the calendar format.
    assert "DTSTART;VALUE=DATE:20270612" in body
    assert "DTEND;VALUE=DATE:20270613" in body


def test_calendar_refuses_events_the_guest_was_not_invited_to(client, api, wedding, jo):
    other = api.post(
        f"/weddings/{wedding['id']}/events",
        expected=201,
        json={"name": "Brunch", "kind": "other", "starts_at": "2027-06-13T11:00:00"},
    ).json()
    theirs = f"/api/v1/public/rsvp/{jo['rsvp_token']}/calendar.ics"
    assert client.get(f"{theirs}?event={other['id']}").status_code == 404
    # The day is in the file; an unknown token and an uninvited guest get nothing.
    assert client.get(theirs).status_code == 200
    nobody = add_guest(api, wedding, "Una")
    assert client.get(f"/api/v1/public/rsvp/{nobody['rsvp_token']}/calendar.ics").status_code == 404
    assert client.get("/api/v1/public/rsvp/unknown-token/calendar.ics").status_code == 404
