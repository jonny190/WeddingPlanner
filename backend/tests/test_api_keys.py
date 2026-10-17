"""API keys: long-lived credentials for agents and scripts, bound to one account."""

import re
import uuid
from datetime import timedelta

from app.core.db import utcnow
from app.modules.tenancy.models import ApiKey
from tests.conftest import Api, add_guest, sign_up


def make_key(api: Api, **fields) -> dict:
    payload = {"name": "Hermes", **fields}
    return api.post("/tenants/current/api-keys", expected=201, json=payload).json()


def as_key(api: Api, key: str, tenant_id: str | None = None) -> Api:
    headers = {"Authorization": f"Bearer {key}"}
    if tenant_id:
        headers["X-Tenant-ID"] = tenant_id
    return Api(client=api.client, headers=headers, tenant_id=api.tenant_id, email=api.email)


def join_as(client, mailbox, api: Api, email: str, role: str) -> Api:
    """Invite someone with a role and accept on their behalf, returning their session."""
    api.post("/tenants/current/invites", expected=201, json={"email": email, "role": role})
    token = re.search(r"/invite/([A-Za-z0-9_\-]+)", mailbox.outbox[-1].text).group(1)
    response = client.post(
        f"/api/v1/public/invites/{token}/accept",
        json={"full_name": "New Member", "password": "member-pass"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    return Api(
        client=client,
        headers={"Authorization": f"Bearer {body['access_token']}", "X-Tenant-ID": api.tenant_id},
        tenant_id=api.tenant_id,
        email=email,
    )


def test_key_is_shown_once_and_acts_as_its_owner(api, wedding):
    created = make_key(api, can_write=False)
    assert created["key"].startswith("wp_")
    assert created["prefix"] == created["key"][:11]
    assert created["can_write"] is False
    listed = api.get("/tenants/current/api-keys").json()
    assert [k["name"] for k in listed] == ["Hermes"]
    assert "key" not in listed[0]

    agent = as_key(api, created["key"])
    # The key names the account, so no X-Tenant-ID header is needed.
    assert agent.get("/tenants/current").json()["id"] == api.tenant_id
    assert [w["id"] for w in agent.get("/weddings").json()] == [wedding["id"]]
    assert agent.get("/tenants/current/api-keys").json()[0]["last_used_at"] is not None


def test_key_cannot_reach_other_accounts(client, api, wedding):
    other = sign_up(client, "other@example.com", "Other Weddings")
    other_wedding = other.post(
        "/weddings", expected=201, json={"partner_one_name": "C", "partner_two_name": "D"}
    ).json()
    agent = as_key(api, make_key(api)["key"])
    agent.get(f"/weddings/{other_wedding['id']}", expected=404)
    assert [w["id"] for w in agent.get("/weddings").json()] == [wedding["id"]]
    # Naming another account in the header does not help.
    wrong = as_key(api, make_key(api)["key"], tenant_id=other.tenant_id)
    assert wrong.get("/weddings", expected=403).json()["code"] == "wrong_tenant"
    # Naming its own account is fine.
    as_key(api, make_key(api)["key"], tenant_id=api.tenant_id).get("/weddings")


def test_read_only_key_cannot_change_anything(api, wedding):
    agent = as_key(api, make_key(api, can_write=False)["key"])
    agent.post("/weddings", expected=403, json={"partner_one_name": "A", "partner_two_name": "B"})
    agent.patch(f"/weddings/{wedding['id']}", expected=403, json={"notes": "x"})
    agent.get(f"/weddings/{wedding['id']}/guests")


def test_writing_key_needs_send_permission_to_email(api, wedding, day):
    add_guest(api, wedding, "Jo", email="jo@example.com", invitations=[{"event_id": day["id"]}])
    drafts = f"/weddings/{wedding['id']}/events/{day['id']}/invitation-drafts"
    writer = as_key(api, make_key(api, can_write=True)["key"])
    draft = writer.post(drafts, expected=201, json={"name": "Main"}).json()
    # Looking is fine; sending is not.
    assert writer.post(f"{drafts}/{draft['id']}/send", json={"dry_run": True}).json()["queued"]
    refused = writer.post(f"{drafts}/{draft['id']}/send", expected=403, json={})
    assert refused.json()["code"] == "send_not_allowed"
    writer.post(f"{drafts}/{draft['id']}/send-test", expected=403, json={"email": "me@x.com"})
    writer.post(
        f"/weddings/{wedding['id']}/events/{day['id']}/deliveries/retry-failed", expected=403
    )
    writer.post(
        "/tenants/current/invites",
        expected=403,
        json={"email": "new@example.com", "role": "editor"},
    )

    sender = as_key(api, make_key(api, can_write=True, can_send=True)["key"])
    assert len(sender.post(f"{drafts}/{draft['id']}/send", json={}).json()["queued"]) == 1


def test_keys_are_managed_only_from_a_signed_in_session(api):
    created = make_key(api, can_write=True)
    agent = as_key(api, created["key"])
    agent.post("/tenants/current/api-keys", expected=403, json={"name": "another"})
    agent.delete(f"/tenants/current/api-keys/{created['id']}", expected=403)
    # Permissions are validated at creation time.
    api.post(
        "/tenants/current/api-keys",
        expected=400,
        json={"name": "x", "can_write": False, "can_send": True},
    )


def test_a_viewer_cannot_make_a_key_that_writes(client, api, mailbox):
    viewer = join_as(client, mailbox, api, "viewer@example.com", "viewer")
    viewer.post("/tenants/current/api-keys", expected=403, json={"name": "x", "can_write": True})
    reader = as_key(viewer, make_key(viewer)["key"])
    reader.get("/weddings")


def test_members_see_their_own_keys_and_admins_see_all(client, api, mailbox):
    editor = join_as(client, mailbox, api, "editor@example.com", "editor")
    owners_key = make_key(api, name="Owner's agent")
    editors_key = make_key(editor, name="Editor's agent", can_write=True)
    assert [k["name"] for k in editor.get("/tenants/current/api-keys").json()] == ["Editor's agent"]
    assert {k["name"] for k in api.get("/tenants/current/api-keys").json()} == {
        "Owner's agent",
        "Editor's agent",
    }
    editor.delete(f"/tenants/current/api-keys/{owners_key['id']}", expected=404)
    api.delete(f"/tenants/current/api-keys/{editors_key['id']}")
    as_key(editor, editors_key["key"]).get("/weddings", expected=401)


def test_expired_and_revoked_keys_are_refused(api, session_factory):
    expiring = make_key(api, expires_in_days=1)
    assert expiring["expires_at"] is not None
    with session_factory() as db:
        key = db.get(ApiKey, uuid.UUID(expiring["id"]))
        key.expires_at = utcnow() - timedelta(minutes=1)
        db.commit()
    assert as_key(api, expiring["key"]).get("/weddings", expected=401).json()["code"] == (
        "invalid_api_key"
    )

    revoked = make_key(api)
    api.delete(f"/tenants/current/api-keys/{revoked['id']}")
    as_key(api, revoked["key"]).get("/weddings", expected=401)
    as_key(api, "wp_not-a-real-key").get("/weddings", expected=401)


def test_removing_a_member_revokes_their_keys(client, api, mailbox):
    editor = join_as(client, mailbox, api, "editor@example.com", "editor")
    key = make_key(editor)["key"]
    as_key(editor, key).get("/weddings")
    members = api.get("/tenants/current/members").json()
    membership = next(m for m in members if m["email"] == "editor@example.com")
    api.delete(f"/tenants/current/members/{membership['id']}")
    as_key(editor, key).get("/weddings", expected=401)
    assert all(
        k["user_id"] != membership["user_id"] for k in api.get("/tenants/current/api-keys").json()
    )
