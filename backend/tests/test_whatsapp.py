"""Invitations by WhatsApp: mobiles in international format, a message per draft, the bridge."""

import json

import httpx2
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.core.db import create_db_engine
from app.core.errors import BadRequest
from app.main import create_app
from app.modules.guests.phones import mobile_number, normalise_phone
from app.modules.notifications.whatsapp import WahaBackend, WhatsAppError, WhatsAppMessage
from tests.conftest import add_guest, sign_up


def test_phone_numbers_are_normalised_and_mobiles_recognised():
    assert normalise_phone("07911 123456", "GB") == "+447911123456"
    assert normalise_phone("+1 212-555-0123", "GB") == "+12125550123"
    assert normalise_phone("  ", "GB") is None
    with pytest.raises(BadRequest) as refused:
        normalise_phone("12345", "GB")
    assert refused.value.code == "invalid_phone"
    assert mobile_number("07911 123456", "GB") == "+447911123456"
    # A London landline is a valid number but has no WhatsApp.
    assert mobile_number("020 7946 0958", "GB") is None
    assert mobile_number("not a number", "GB") is None


def test_guests_mobiles_are_stored_in_international_format(api, wedding):
    guest = add_guest(api, wedding, "Jo", phone="07911 123456")
    assert guest["phone"] == "+447911123456"
    updated = api.patch(
        f"/weddings/{wedding['id']}/guests/{guest['id']}", json={"phone": "+44 7911 123457"}
    )
    assert updated.json()["phone"] == "+447911123457"
    bad = api.post(
        f"/weddings/{wedding['id']}/guests",
        expected=400,
        json={"first_name": "X", "phone": "12345"},
    )
    assert bad.json()["code"] == "invalid_phone"

    content = "first_name,mobile\nAnn,07911 123458\nBen,nope\n"
    result = api.post(
        f"/weddings/{wedding['id']}/guests/import",
        files={"file": ("guests.csv", content.encode(), "text/csv")},
    ).json()
    assert result["created"] == 1
    assert [e["row"] for e in result["errors"]] == [3]


def test_waha_backend_sends_to_the_number_as_a_chat():
    seen: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(request)
        if request.url.path == "/api/sessions/default":
            return httpx2.Response(
                200, json={"status": "WORKING", "me": {"id": "447700900000@c.us"}}
            )
        return httpx2.Response(201, json={"id": "true_447911123456@c.us_ABC"})

    settings = Settings(whatsapp_backend="waha", waha_api_key="secret")
    client = httpx2.Client(transport=httpx2.MockTransport(handler), base_url="http://waha:3000")
    backend = WahaBackend(settings, client=client)
    backend.send(WhatsAppMessage(to="+447911123456", text="Hi Jo"))
    sent = seen[-1]
    assert sent.url.path == "/api/sendText"
    assert json.loads(sent.content) == {
        "session": "default",
        "chatId": "447911123456@c.us",
        "text": "Hi Jo",
        "linkPreview": True,
    }
    status = backend.status()
    assert status.connected and status.number == "+447700900000"


def test_waha_backend_reports_problems_readably():
    def handler(request: httpx2.Request) -> httpx2.Response:
        if request.url.path.startswith("/api/sessions/"):
            return httpx2.Response(200, json={"status": "SCAN_QR_CODE"})
        return httpx2.Response(422, json={"message": "session not started"})

    client = httpx2.Client(transport=httpx2.MockTransport(handler), base_url="http://waha:3000")
    backend = WahaBackend(Settings(whatsapp_backend="waha"), client=client)
    status = backend.status()
    assert not status.connected and "QR" in status.detail
    with pytest.raises(WhatsAppError):
        backend.send(WhatsAppMessage(to="+447911123456", text="Hi"))


def test_channels_reflect_the_servers_set_up(api, settings, engine):
    channels = api.get("/invitation-channels").json()
    assert channels["email"] is True
    assert channels["whatsapp"]["enabled"] and channels["whatsapp"]["connected"]
    assert channels["whatsapp"]["number"] == "+447700900000"

    # A server with no bridge hides the channel and refuses to send through it.
    with TestClient(create_app(settings, engine)) as plain:
        plain_api = sign_up(plain, "plain@example.com", "Plain")
        off = plain_api.get("/invitation-channels").json()["whatsapp"]
        assert off["enabled"] is False
        wedding = plain_api.post(
            "/weddings", expected=201, json={"partner_one_name": "A", "partner_two_name": "B"}
        ).json()
        event = wedding["events"][0]
        drafts = f"/weddings/{wedding['id']}/events/{event['id']}/invitation-drafts"
        draft = plain_api.post(drafts, expected=201, json={}).json()
        refused = plain_api.post(
            f"{drafts}/{draft['id']}/send", expected=400, json={"via": "whatsapp", "dry_run": True}
        )
        assert refused.json()["code"] == "whatsapp_disabled"


def test_invitations_go_by_whatsapp_with_the_tracked_link(
    client, api, wedding, day, outbox, whatsapp
):
    both = add_guest(
        api,
        wedding,
        "Both",
        email="both@example.com",
        phone="07911 100001",
        invitations=[{"event_id": day["id"]}],
    )
    mobile_only = add_guest(
        api, wedding, "Mobile", phone="07911 100002", invitations=[{"event_id": day["id"]}]
    )
    email_only = add_guest(
        api, wedding, "Email", email="email@example.com", invitations=[{"event_id": day["id"]}]
    )
    landline = add_guest(
        api, wedding, "Landline", phone="020 7946 0958", invitations=[{"event_id": day["id"]}]
    )
    add_guest(api, wedding, "Nothing", invitations=[{"event_id": day["id"]}])

    drafts = f"/weddings/{wedding['id']}/events/{day['id']}/invitation-drafts"
    draft = api.post(drafts, expected=201, json={"name": "Main"}).json()
    assert "{{rsvp_link}}" in draft["whatsapp_body"]
    api.patch(
        f"{drafts}/{draft['id']}",
        json={"whatsapp_body": "Hey {{first_name}}, you're invited! {{rsvp_link}}"},
    )

    dry = api.post(f"{drafts}/{draft['id']}/send", json={"via": "whatsapp", "dry_run": True}).json()
    assert {(r["full_name"], r["channel"], r["address"]) for r in dry["queued"]} == {
        ("Both Guest", "whatsapp", "+447911100001"),
        ("Mobile Guest", "whatsapp", "+447911100002"),
    }
    assert {(r["full_name"], r["reason"]) for r in dry["skipped"]} == {
        ("Email Guest", "no mobile number"),
        ("Landline Guest", "phone number is not a mobile"),
        ("Nothing Guest", "no mobile number"),
    }

    fallback = api.post(
        f"{drafts}/{draft['id']}/send", json={"via": "whatsapp_or_email", "dry_run": True}
    ).json()
    assert {(r["full_name"], r["channel"]) for r in fallback["queued"]} == {
        ("Both Guest", "whatsapp"),
        ("Mobile Guest", "whatsapp"),
        ("Email Guest", "email"),
    }
    assert [r["full_name"] for r in fallback["skipped"]] == ["Landline Guest", "Nothing Guest"]

    sent = api.post(f"{drafts}/{draft['id']}/send", json={"via": "whatsapp_or_email"}).json()
    assert len(sent["queued"]) == 3
    assert outbox.deliver() == 3
    assert {m.to for m in whatsapp.outbox} == {"+447911100001", "+447911100002"}
    message = next(m for m in whatsapp.outbox if m.to == "+447911100002")
    assert message.text.startswith("Hey Mobile, you're invited!")
    assert "https://app.test/i/" in message.text
    assert [m.to for m in outbox.outbox] == ["email@example.com"]

    # Opening the WhatsApp link counts like any other open, and the invitation is marked sent.
    token = message.text.split("/i/")[1].split()[0]
    opened = client.post(f"/api/v1/public/links/{token}/open").json()
    assert opened["rsvp_token"] == mobile_only["rsvp_token"]
    replies = {
        r["full_name"]: r
        for r in api.get(f"/weddings/{wedding['id']}/events/{day['id']}/replies").json()
    }
    assert replies["Mobile Guest"]["engagement"] == "opened"
    assert replies["Both Guest"]["engagement"] == "sent"
    deliveries = api.get(f"/weddings/{wedding['id']}/deliveries").json()
    assert {(d["guest_name"], d["channel"], d["status"]) for d in deliveries} == {
        ("Both Guest", "whatsapp", "sent"),
        ("Mobile Guest", "whatsapp", "sent"),
        ("Email Guest", "email", "sent"),
    }
    assert both["id"] and email_only["id"] and landline["id"]


def test_preview_and_test_send_cover_whatsapp(api, wedding, day, outbox, whatsapp):
    jo = add_guest(api, wedding, "Jo", phone="07911 123456", invitations=[{"event_id": day["id"]}])
    drafts = f"/weddings/{wedding['id']}/events/{day['id']}/invitation-drafts"
    draft = api.post(drafts, expected=201, json={"name": "Main"}).json()
    preview = api.post(f"{drafts}/{draft['id']}/preview", json={"guest_id": jo["id"]}).json()
    assert preview["whatsapp_text"].startswith("Hi Jo!")
    assert "https://app.test/rsvp/" in preview["whatsapp_text"]
    unsaved = api.post(
        f"{drafts}/{draft['id']}/preview", json={"whatsapp_body": "Yo {{first_name}} {{nope}}"}
    ).json()
    assert unsaved["unknown_placeholders"] == ["nope"]
    assert unsaved["whatsapp_text"].startswith("Yo Alex")

    api.post(
        f"{drafts}/{draft['id']}/send-test",
        expected=202,
        json={"channel": "whatsapp", "phone": "07911 100999", "guest_id": jo["id"]},
    )
    api.post(f"{drafts}/{draft['id']}/send-test", expected=422, json={"channel": "whatsapp"})
    assert outbox.deliver() == 1
    assert whatsapp.outbox[0].to == "+447911100999"
    assert "Hi Jo!" in whatsapp.outbox[0].text
    assert "/i/" not in whatsapp.outbox[0].text


def test_whatsapp_delivery_fails_cleanly_without_a_bridge(
    api, wedding, day, settings, session_factory, mailbox
):
    """A worker without a bridge marks WhatsApp deliveries failed rather than crashing."""
    from app.modules.invitations.dispatcher import dispatch_due_deliveries

    add_guest(api, wedding, "Jo", phone="07911 123456", invitations=[{"event_id": day["id"]}])
    drafts = f"/weddings/{wedding['id']}/events/{day['id']}/invitation-drafts"
    draft = api.post(drafts, expected=201, json={}).json()
    api.post(f"{drafts}/{draft['id']}/send", json={"via": "whatsapp"})
    for _ in range(settings.delivery_max_attempts):
        dispatch_due_deliveries(session_factory, mailbox, settings, whatsapp=None)
        from app.modules.invitations.models import InvitationDelivery

        with session_factory() as db:
            db.query(InvitationDelivery).update({"next_attempt_at": None})
            db.commit()
    delivery = api.get(f"/weddings/{wedding['id']}/deliveries").json()[0]
    assert delivery["status"] == "failed"
    assert "not configured" in delivery["error"]
    assert mailbox.outbox == []
    _ = create_db_engine, StaticPool
