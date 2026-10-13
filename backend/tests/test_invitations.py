import re

import pytest

from app.modules.invitations.models import InvitationDelivery
from tests.conftest import PNG_BYTES, add_guest, sign_up


@pytest.fixture
def drafts(wedding, day):
    return f"/weddings/{wedding['id']}/events/{day['id']}/invitation-drafts"


@pytest.fixture
def draft(api, drafts):
    return api.post(drafts, expected=201, json={"name": "Main invitation"}).json()


def guest_for(api, wedding, event, name, email=True, plus_one=False):
    return add_guest(
        api,
        wedding,
        name,
        email=f"{name.lower()}@example.com" if email else None,
        invitations=[{"event_id": event["id"], "plus_one_allowed": plus_one}],
    )


def tracked_token(text: str) -> str:
    return re.search(r"https://app\.test/i/(\S+)", text).group(1)


def test_new_draft_gets_default_copy_and_card(draft):
    assert "{{couple_names}}" in draft["subject"]
    assert "{{rsvp_link}}" in draft["body"]
    families = {layer["font_family"] for layer in draft["design"]["layers"]}
    assert "Great Vibes" in families
    assert draft["status"] == "draft"


def test_design_validation(api, drafts, draft, client):
    design = draft["design"]
    design["layers"][0]["font_family"] = "Comic Sans MS"
    api.patch(f"{drafts}/{draft['id']}", expected=422, json={"design": design})

    design["layers"][0]["font_family"] = "Lato"
    design["layers"].append(design["layers"][1])  # duplicate id
    api.patch(f"{drafts}/{draft['id']}", expected=422, json={"design": design})

    other = sign_up(client, "other@example.com", "Other")
    other_wedding = other.post(
        "/weddings", expected=201, json={"partner_one_name": "C", "partner_two_name": "D"}
    ).json()
    foreign = other.post(
        f"/weddings/{other_wedding['id']}/media",
        expected=201,
        files={"file": ("x.png", PNG_BYTES, "image/png")},
    ).json()
    design["layers"].pop()
    design["background"]["image_asset_id"] = foreign["id"]
    api.patch(f"{drafts}/{draft['id']}", expected=400, json={"design": design})


def test_preview_personalises_email_and_card(api, wedding, day, drafts, draft):
    jo = guest_for(api, wedding, day, "Jo", plus_one=True)
    preview = api.post(f"{drafts}/{draft['id']}/preview", json={"guest_id": jo["id"]}).json()
    assert preview["subject"] == "You're invited to the wedding of Sam & Alex"
    assert "Dear Jo," in preview["text"]
    assert "bring a guest" in preview["text"]
    assert "https://app.test/rsvp/" in preview["text"]
    card_text = " ".join(layer.get("text", "") for layer in preview["card"]["layers"])
    assert "Jo Guest" in card_text and "{{" not in card_text
    assert {f["family"] for f in preview["fonts"]} >= {"Great Vibes", "Montserrat"}

    unsaved = api.post(
        f"{drafts}/{draft['id']}/preview", json={"body": "Hi {{first_name}} {{nonsense}}"}
    ).json()
    assert unsaved["unknown_placeholders"] == ["nonsense"]
    assert "Alex" in unsaved["text"]  # example guest
    assert "https://app.test/rsvp/" in unsaved["text"]  # link always appended


def test_email_uses_design_header_and_button(api, wedding, day, drafts, draft, outbox):
    asset = api.post(
        f"/weddings/{wedding['id']}/media",
        expected=201,
        files={"file": ("header.png", PNG_BYTES, "image/png")},
    ).json()
    design = draft["design"]
    design["email"].update(
        header_asset_id=asset["id"], button_text="Open invitation", accent_color="#335544"
    )
    api.patch(f"{drafts}/{draft['id']}", json={"design": design})
    guest_for(api, wedding, day, "Jo")
    api.post(f"{drafts}/{draft['id']}/send", json={"audience": "all"})
    outbox.deliver()

    html = outbox.outbox[0].html
    assert f"https://app.test/api/v1/public/media/{asset['id']}" in html
    assert "Open invitation" in html and "#335544" in html
    assert outbox.outbox[0].reply_to == "couple@example.com"


def test_send_queues_once_and_worker_delivers(api, wedding, day, evening, drafts, draft, outbox):
    guest_for(api, wedding, day, "Jo")
    guest_for(api, wedding, day, "Nomail", email=False)
    guest_for(api, wedding, evening, "Evening")  # not invited to the day

    dry = api.post(f"{drafts}/{draft['id']}/send", json={"dry_run": True}).json()
    assert [r["full_name"] for r in dry["queued"]] == ["Jo Guest"]
    assert [r["full_name"] for r in dry["skipped_no_email"]] == ["Nomail Guest"]
    assert api.get(f"/weddings/{wedding['id']}/deliveries").json() == []

    api.post(f"{drafts}/{draft['id']}/send", json={"audience": "unsent"})
    # Already queued, so a second "unsent" send finds nobody new.
    again = api.post(f"{drafts}/{draft['id']}/send", json={"audience": "unsent"}).json()
    assert again["queued"] == []

    assert outbox.deliver() == 1
    assert [m.to for m in outbox.outbox] == ["jo@example.com"]
    deliveries = api.get(f"/weddings/{wedding['id']}/deliveries").json()
    assert [(d["guest_name"], d["status"]) for d in deliveries] == [("Jo Guest", "sent")]

    replies = api.get(f"/weddings/{wedding['id']}/events/{day['id']}/replies").json()
    by_name = {r["full_name"]: r for r in replies}
    assert by_name["Jo Guest"]["engagement"] == "sent"
    assert by_name["Nomail Guest"]["engagement"] == "not_sent"

    sent_draft = api.get(f"{drafts}/{draft['id']}").json()
    assert sent_draft["status"] == "sent" and sent_draft["sent_count"] == 1


def test_failed_deliveries_retry_then_fail(
    api, wedding, day, drafts, draft, outbox, session_factory
):
    guest_for(api, wedding, day, "Jo")
    api.post(f"{drafts}/{draft['id']}/send", json={})

    def broken(_message):
        raise ConnectionError("SMTP down")

    outbox.send = broken
    outbox.deliver()
    delivery = api.get(f"/weddings/{wedding['id']}/deliveries").json()[0]
    assert delivery["status"] == "queued" and delivery["attempts"] == 1

    with session_factory() as db:  # make the retry due now
        db.query(InvitationDelivery).update({"next_attempt_at": None})
        db.commit()
    outbox.deliver()
    delivery = api.get(f"/weddings/{wedding['id']}/deliveries").json()[0]
    assert delivery["status"] == "failed"
    assert "SMTP down" in delivery["error"]

    retried = api.post(f"/weddings/{wedding['id']}/events/{day['id']}/deliveries/retry-failed")
    assert retried.json() == {"affected": 1}


def test_test_send_is_not_tracked(api, drafts, draft, outbox):
    api.post(f"{drafts}/{draft['id']}/send-test", expected=202, json={"email": "me@example.com"})
    outbox.deliver()
    message = outbox.outbox[0]
    assert message.subject.startswith("[Test]")
    assert "/i/" not in message.text


def test_link_click_tracking(api, client, wedding, day, drafts, draft, outbox):
    jo = guest_for(api, wedding, day, "Jo")
    guest_for(api, wedding, day, "Pat")
    api.post(f"{drafts}/{draft['id']}/send", json={})
    outbox.deliver()
    jo_email = next(m for m in outbox.outbox if m.to == "jo@example.com")
    token = tracked_token(jo_email.text)
    assert f"https://app.test/i/{token}" in jo_email.html

    opened = client.post(f"/api/v1/public/links/{token}/open", headers={"User-Agent": "Phone"})
    assert opened.status_code == 200
    assert opened.json() == {"rsvp_token": jo["rsvp_token"], "event_id": day["id"]}
    client.post(f"/api/v1/public/links/{token}/open")  # refresh within debounce window

    replies = f"/weddings/{wedding['id']}/events/{day['id']}/replies"
    opened_rows = api.get(replies, params={"engagement": "opened"}).json()
    assert [(r["full_name"], r["click_count"]) for r in opened_rows] == [("Jo Guest", 1)]
    summary = api.get(f"{replies}/summary").json()
    assert (summary["opened"], summary["opened_no_reply"]) == (1, 1)

    nudge = api.post(
        f"{drafts}/{draft['id']}/send", json={"audience": "opened_no_reply", "dry_run": True}
    ).json()
    assert [r["full_name"] for r in nudge["queued"]] == ["Jo Guest"]
    never = api.post(
        f"{drafts}/{draft['id']}/send", json={"audience": "not_opened", "dry_run": True}
    ).json()
    assert [r["full_name"] for r in never["queued"]] == ["Pat Guest"]

    client.post(
        f"/api/v1/public/rsvp/{jo['rsvp_token']}",
        json={"responses": [{"event_id": day["id"], "attending": True}]},
    )
    summary = api.get(f"{replies}/summary").json()
    assert summary["opened_no_reply"] == 0

    assert client.post("/api/v1/public/links/not-a-token/open").status_code == 404


def test_mark_sent_for_posted_invitations(api, client, wedding, day):
    jo = guest_for(api, wedding, day, "Jo", email=False)
    assert client.get(f"/api/v1/public/rsvp/{jo['rsvp_token']}").json()["events"] == []
    api.post(
        f"/weddings/{wedding['id']}/events/{day['id']}/invitations/mark-sent",
        json={"guest_ids": [jo["id"]]},
    )
    view = client.get(f"/api/v1/public/rsvp/{jo['rsvp_token']}").json()
    assert [e["name"] for e in view["events"]] == ["Wedding Day"]


def test_copy_draft_to_another_event(api, wedding, evening, drafts, draft):
    design = draft["design"]
    design["background"]["color"] = "#112233"
    api.patch(f"{drafts}/{draft['id']}", json={"design": design, "subject": "Custom"})
    copied = api.post(
        f"/weddings/{wedding['id']}/events/{evening['id']}/invitation-drafts",
        expected=201,
        json={"name": "Evening", "copy_from_draft_id": draft["id"]},
    ).json()
    assert copied["subject"] == "Custom"
    assert copied["design"]["background"]["color"] == "#112233"


def test_placeholders_and_fonts_are_listed(api):
    names = {p["name"] for p in api.get("/invitation-placeholders").json()}
    assert {"first_name", "rsvp_link", "event_when"} <= names
    fonts = api.get("/invitation-fonts").json()
    assert any(f["family"] == "Great Vibes" and f["category"] == "script" for f in fonts)


def test_slow_batches_are_not_requeued_as_stale(
    api, wedding, day, drafts, draft, outbox, session_factory
):
    """A worker touches the rows it still holds before each send, so a long batch is never
    mistaken for one left behind by a dead worker and sent a second time."""
    from datetime import timedelta

    from app.core.db import utcnow
    from app.modules.invitations import dispatcher

    for name in ("Jo", "Pat", "Sam"):
        guest_for(api, wedding, day, name)
    api.post(f"{drafts}/{draft['id']}/send", json={})

    # Pretend the batch was claimed long ago by a worker that then died.
    with session_factory() as db:
        db.query(InvitationDelivery).update(
            {"status": "sending", "updated_at": utcnow() - dispatcher.STALE_AFTER * 2}
        )
        db.commit()

    seen = []

    def slow_send(message):
        # While one email is on its way, the rest of the batch must look alive.
        with session_factory() as db:
            freshest = max(d.updated_at for d in db.query(InvitationDelivery))
            assert utcnow() - freshest < timedelta(seconds=30)
        seen.append(message.to)

    outbox.send = slow_send
    assert outbox.deliver() == 3  # the stale rows were requeued and claimed
    assert sorted(seen) == ["jo@example.com", "pat@example.com", "sam@example.com"]
    assert outbox.deliver() == 0  # and nothing is sent twice


def test_envelope_settings_are_part_of_the_design(api, client, wedding, day, drafts, draft, outbox):
    # Defaults: the envelope follows the card.
    assert draft["design"]["envelope"] == {
        "enabled": True,
        "paper_color": None,
        "seal_color": None,
        "ink_color": "#1f5436",
        "initials": "",
        "stamp_text": "",
        "hint": "Break the seal to open",
    }
    design = {
        **draft["design"],
        "envelope": {
            "enabled": True,
            "paper_color": "#e8d8b8",
            "seal_color": "#7a1f2b",
            "ink_color": "#223355",
            "initials": "S+A",
            "stamp_text": "2027",
            "hint": "Tap to break the wax",
        },
    }
    saved = api.patch(f"{drafts}/{draft['id']}", json={"design": design}).json()
    assert saved["design"]["envelope"]["seal_color"] == "#7a1f2b"
    assert saved["design"]["envelope"]["hint"] == "Tap to break the wax"

    bad = {**design, "envelope": {**design["envelope"], "seal_color": "red"}}
    api.patch(f"{drafts}/{draft['id']}", expected=422, json={"design": bad})

    # The guest's page carries the settings with the card.
    guest = guest_for(api, wedding, day, "Jo")
    api.post(f"{drafts}/{draft['id']}/send", json={"audience": "all"})
    outbox.deliver()
    view = client.get(f"/api/v1/public/rsvp/{guest['rsvp_token']}").json()
    assert view["events"][0]["card"]["envelope"]["initials"] == "S+A"
