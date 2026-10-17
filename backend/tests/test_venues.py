"""Venues: the places being considered, and how the chosen one reaches guests."""

from app.modules.invitations.service import calendar_url
from app.modules.rsvp.calendar import ics_url
from tests.conftest import add_guest, sign_up

MANOR = {
    "name": "Hartwell Manor",
    "status": "shortlisted",
    "address": "Hartwell Lane, Cotswolds, GL54 1AA",
    "website": "hartwellmanor.example.com",
    "email": "events@hartwellmanor.example.com",
    "phone": "01451 000000",
    "capacity": 120,
    "price": 6500,
    "price_per_head": 95.5,
    "deposit": 1500,
    "currency": "GBP",
    "price_notes": "Balance due 8 weeks before.",
    "notes": "Loved the orangery.",
    "contacts": [
        {"name": "Priya Shah", "role": "Events coordinator", "email": "priya@example.com"},
        {"name": "Tom Rees", "role": "Head chef", "phone": "01451 000001"},
    ],
}


def test_venue_crud_with_prices_and_contacts(api, wedding):
    base = f"/weddings/{wedding['id']}/venues"
    venue = api.post(base, expected=201, json=MANOR).json()
    assert venue["price_per_head"] == 95.5
    assert [c["name"] for c in venue["contacts"]] == ["Priya Shah", "Tom Rees"]
    assert venue["used_for"] == []

    barn = api.post(base, expected=201, json={"name": "Ashby Barn", "status": "booked"}).json()
    api.post(base, expected=201, json={"name": "The Old Mill", "status": "declined"})
    # Booked first, ruled-out last.
    assert [v["name"] for v in api.get(base).json()] == [
        "Ashby Barn",
        "Hartwell Manor",
        "The Old Mill",
    ]

    updated = api.patch(
        f"{base}/{venue['id']}",
        json={
            "status": "booked",
            "deposit": None,
            "contacts": [{"name": "Priya Shah", "role": "Wedding coordinator"}],
        },
    ).json()
    assert updated["status"] == "booked"
    assert updated["deposit"] is None
    assert updated["price"] == 6500  # untouched
    assert [(c["name"], c["role"]) for c in updated["contacts"]] == [
        ("Priya Shah", "Wedding coordinator")
    ]

    api.post(base, expected=422, json={"name": "Bad", "currency": "pounds"})
    api.post(base, expected=422, json={"name": "Bad", "price": -1})
    api.delete(f"{base}/{barn['id']}")
    api.get(f"{base}/{barn['id']}", expected=404)


def test_choosing_a_venue_supplies_the_events_name_and_address(api, wedding, day, evening):
    base = f"/weddings/{wedding['id']}"
    venue = api.post(f"{base}/venues", expected=201, json=MANOR).json()
    # The day has a venue typed in by hand; the evening has none.
    api.patch(
        f"{base}/events/{day['id']}", json={"venue_name": "Town hall", "venue_address": "1 High St"}
    )

    event = api.patch(f"{base}/events/{day['id']}", json={"venue_id": venue["id"]}).json()
    assert event["venue_id"] == venue["id"]
    assert event["venue_name"] == "Hartwell Manor"
    assert event["venue_address"] == "Hartwell Lane, Cotswolds, GL54 1AA"
    assert api.get(f"{base}/venues/{venue['id']}").json()["used_for"] == [
        {"event_id": day["id"], "event_name": "Wedding Day"}
    ]

    # Editing the venue follows through to the event.
    api.patch(f"{base}/venues/{venue['id']}", json={"address": "Hartwell Lane, GL54 1AA"})
    fresh = api.get(f"{base}/events").json()
    assert (
        next(e for e in fresh if e["id"] == day["id"])["venue_address"] == "Hartwell Lane, GL54 1AA"
    )
    assert next(e for e in fresh if e["id"] == evening["id"])["venue_name"] is None

    # Clearing the choice brings the typed-in venue back.
    cleared = api.patch(f"{base}/events/{day['id']}", json={"venue_id": None}).json()
    assert (cleared["venue_name"], cleared["venue_address"]) == ("Town hall", "1 High St")

    # Only this wedding's venues can be chosen.
    other = api.post(
        "/weddings", expected=201, json={"partner_one_name": "C", "partner_two_name": "D"}
    ).json()
    api.patch(
        f"/weddings/{other['id']}/events/{other['events'][0]['id']}",
        expected=404,
        json={"venue_id": venue["id"]},
    )


def test_deleting_a_used_venue_keeps_its_details_on_the_event(api, wedding, day):
    base = f"/weddings/{wedding['id']}"
    venue = api.post(f"{base}/venues", expected=201, json=MANOR).json()
    api.patch(f"{base}/events/{day['id']}", json={"venue_id": venue["id"]})
    api.delete(f"{base}/venues/{venue['id']}")
    event = next(e for e in api.get(f"{base}/events").json() if e["id"] == day["id"])
    assert event["venue_id"] is None
    assert event["venue_name"] == "Hartwell Manor"
    assert event["venue_address"] == "Hartwell Lane, Cotswolds, GL54 1AA"


def test_venue_reaches_invitations_rsvp_page_and_calendar(client, api, wedding, day):
    base = f"/weddings/{wedding['id']}"
    venue = api.post(f"{base}/venues", expected=201, json=MANOR).json()
    api.patch(f"{base}/events/{day['id']}", json={"venue_id": venue["id"]})
    jo = add_guest(
        api, wedding, "Jo", email="jo@example.com", invitations=[{"event_id": day["id"]}]
    )
    api.post(f"{base}/events/{day['id']}/invitations/mark-sent", json={"guest_ids": [jo["id"]]})

    drafts = f"{base}/events/{day['id']}/invitation-drafts"
    draft = api.post(drafts, expected=201, json={"name": "Main"}).json()
    assert "{{calendar_link}}" in draft["body"]
    preview = api.post(f"{drafts}/{draft['id']}/preview", json={"guest_id": jo["id"]}).json()
    assert "Hartwell Manor\nHartwell Lane, Cotswolds, GL54 1AA" in preview["text"]
    expected_link = (
        f"https://app.test/api/v1/public/rsvp/{jo['rsvp_token']}/calendar.ics?event={day['id']}"
    )
    assert f"Add it to your calendar: {expected_link}" in preview["text"]
    assert preview["unknown_placeholders"] == []

    view = client.get(f"/api/v1/public/rsvp/{jo['rsvp_token']}").json()
    assert view["events"][0]["venue_address"] == "Hartwell Lane, Cotswolds, GL54 1AA"
    assert view["events"][0]["calendar"]["ics_url"] == expected_link
    ics = client.get(expected_link.removeprefix("https://app.test")).text
    assert "LOCATION:Hartwell Manor\\, Hartwell Lane\\, Cotswolds\\, GL54 1AA" in ics


def test_calendar_link_builders_agree():
    class Guest:
        rsvp_token = "tok"

    import uuid

    event_id = uuid.uuid4()
    assert calendar_url("https://app.test/", Guest(), event_id) == ics_url(
        "https://app.test", "tok", event_id
    )


def test_venues_are_private_to_the_account(client, api, wedding):
    venue = api.post(f"/weddings/{wedding['id']}/venues", expected=201, json=MANOR).json()
    other = sign_up(client, "other@example.com", "Other")
    other.get(f"/weddings/{wedding['id']}/venues", expected=404)
    other.get(f"/weddings/{wedding['id']}/venues/{venue['id']}", expected=404)
    other.delete(f"/weddings/{wedding['id']}/venues/{venue['id']}", expected=404)
