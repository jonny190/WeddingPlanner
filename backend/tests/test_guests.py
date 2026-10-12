import csv
import io

from tests.conftest import add_guest


def invitations_by_event(guest: dict) -> dict[str, dict]:
    return {i["event_id"]: i for i in guest["invitations"]}


def test_wedding_starts_with_day_and_evening_events(wedding):
    assert [(e["kind"], e["name"]) for e in wedding["events"]] == [
        ("day", "Wedding Day"),
        ("evening", "Evening Reception"),
    ]
    assert wedding["events"][0]["starts_at"] == "2027-06-12T13:00:00"


def test_day_and_evening_invitations_are_independent(api, wedding, day, evening):
    guest = add_guest(
        api,
        wedding,
        "Jo",
        email="jo@example.com",
        invitations=[
            {"event_id": day["id"], "plus_one_allowed": False},
            {"event_id": evening["id"], "plus_one_allowed": True},
        ],
    )
    invites = invitations_by_event(guest)
    assert invites[day["id"]]["plus_one_allowed"] is False
    assert invites[evening["id"]]["plus_one_allowed"] is True
    assert {i["rsvp_status"] for i in invites.values()} == {"pending"}

    base = f"/weddings/{wedding['id']}/guests/{guest['id']}/invitations"
    api.put(f"{base}/{day['id']}", json={"plus_one_allowed": True})
    api.delete(f"{base}/{evening['id']}")

    guest = api.get(f"/weddings/{wedding['id']}/guests/{guest['id']}").json()
    invites = invitations_by_event(guest)
    assert list(invites) == [day["id"]]
    assert invites[day["id"]]["plus_one_allowed"] is True


def test_update_replaces_invitation_set(api, wedding, day, evening):
    guest = add_guest(api, wedding, "Jo", invitations=[{"event_id": day["id"]}])
    updated = api.patch(
        f"/weddings/{wedding['id']}/guests/{guest['id']}",
        json={"last_name": "Bloggs", "invitations": [{"event_id": evening["id"]}]},
    ).json()
    assert updated["full_name"] == "Jo Bloggs"
    assert list(invitations_by_event(updated)) == [evening["id"]]


def test_events_from_another_wedding_are_rejected(api, wedding):
    other = api.post(
        "/weddings", expected=201, json={"partner_one_name": "C", "partner_two_name": "D"}
    ).json()
    api.post(
        f"/weddings/{wedding['id']}/guests",
        expected=400,
        json={"first_name": "X", "invitations": [{"event_id": other["events"][0]["id"]}]},
    )


def test_bulk_invite_and_remove(api, wedding, evening):
    guests = [add_guest(api, wedding, name) for name in ("A", "B", "C")]
    ids = [g["id"] for g in guests]
    base = f"/weddings/{wedding['id']}/events/{evening['id']}/invitations"
    assert api.post(f"{base}/bulk", json={"guest_ids": ids, "plus_one_allowed": True}).json() == {
        "affected": 3
    }
    invited = api.get(f"/weddings/{wedding['id']}/guests", params={"event_id": evening["id"]})
    assert len(invited.json()) == 3
    assert api.post(f"{base}/bulk-remove", json={"guest_ids": ids[:2]}).json() == {"affected": 2}
    invited = api.get(f"/weddings/{wedding['id']}/guests", params={"event_id": evening["id"]})
    assert [g["first_name"] for g in invited.json()] == ["C"]


def test_search_and_group_filters(api, wedding):
    add_guest(api, wedding, "Alice", "Smith", group_name="Family")
    add_guest(api, wedding, "Bob", "Jones", email="bob@uni.example", group_name="Uni")
    url = f"/weddings/{wedding['id']}/guests"
    assert [g["first_name"] for g in api.get(url, params={"search": "uni.ex"}).json()] == ["Bob"]
    assert [g["first_name"] for g in api.get(url, params={"group": "Family"}).json()] == ["Alice"]


def test_csv_import_and_export(api, wedding, day, evening):
    content = (
        "First Name,Last Name,Email,Group,Day,Day Plus One,Evening\n"
        "Ann,Lee,ann@example.com,Family,yes,yes,yes\n"
        "Ben,Ray,,Work,no,,yes\n"
        ",Nobody,,,yes,,\n"
        "Cat,Bad,not-an-email,,yes,,\n"
    )
    result = api.post(
        f"/weddings/{wedding['id']}/guests/import",
        files={"file": ("guests.csv", content.encode(), "text/csv")},
    ).json()
    assert result["created"] == 2
    assert [e["row"] for e in result["errors"]] == [4, 5]

    guests = {g["first_name"]: g for g in api.get(f"/weddings/{wedding['id']}/guests").json()}
    ann = invitations_by_event(guests["Ann"])
    assert ann[day["id"]]["plus_one_allowed"] is True
    assert ann[evening["id"]]["plus_one_allowed"] is False
    assert list(invitations_by_event(guests["Ben"])) == [evening["id"]]

    exported = api.get(f"/weddings/{wedding['id']}/guests/export")
    rows = list(csv.DictReader(io.StringIO(exported.text)))
    ann_row = next(r for r in rows if r["first_name"] == "Ann")
    assert ann_row["day"] == "yes" and ann_row["day_plus_one"] == "yes"
    assert ann_row["evening"] == "yes" and ann_row["evening_rsvp"] == "pending"


def test_deleting_a_guest_removes_their_invitations(api, wedding, day):
    guest = add_guest(api, wedding, "Jo", invitations=[{"event_id": day["id"]}])
    api.delete(f"/weddings/{wedding['id']}/guests/{guest['id']}")
    replies = api.get(f"/weddings/{wedding['id']}/events/{day['id']}/replies").json()
    assert replies == []


def test_timestamps_are_utc_and_blank_title_resets(api, wedding, day):
    add_guest(api, wedding, "Jo", invitations=[{"event_id": day["id"]}])
    listed = api.get(f"/weddings/{wedding['id']}/guests").json()[0]
    assert listed["created_at"].endswith("Z") or listed["created_at"].endswith("+00:00")
    assert day["starts_at"] == "2027-06-12T13:00:00"  # venue wall-clock time, no zone

    api.patch(f"/weddings/{wedding['id']}", json={"title": "Our big day"})
    reset = api.patch(f"/weddings/{wedding['id']}", json={"title": "  "}).json()
    assert reset["title"] == "Sam & Alex"
