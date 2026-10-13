import re
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import delete, func, select

from app.core.db import bind_tenant
from app.core.security import create_password_reset_token
from app.modules.guests.models import Guest
from app.modules.tenancy.models import MembershipInvite, Tenant, User
from app.modules.weddings.models import Wedding
from tests.conftest import Api, add_guest, sign_up


def link_in(message, path: str) -> str:
    """The first link of the form https://app.test/<path>/<token> in an email."""
    match = re.search(rf"https://app\.test/{path}/(\S+)", message.text)
    assert match, message.text
    return match.group(1)


def login_as(client, email: str, password: str, tenant_id: str) -> Api:
    body = client.post("/api/v1/auth/login", json={"email": email, "password": password}).json()
    assert "access_token" in body, body
    return Api(
        client,
        {"Authorization": f"Bearer {body['access_token']}", "X-Tenant-ID": tenant_id},
        tenant_id,
        email,
    )


def invite(api: Api, mailbox, email: str, role: str = "editor") -> str:
    """Send an invitation and return the token from the email."""
    api.post("/tenants/current/invites", expected=201, json={"email": email, "role": role})
    return link_in(mailbox.outbox[-1], "invite")


def test_signup_login_and_me(client, api):
    login = client.post(
        "/api/v1/auth/login", json={"email": "OWNER@example.com", "password": "correct-horse"}
    )
    assert login.status_code == 200
    assert login.json()["tenants"][0]["role"] == "owner"

    me = api.get("/auth/me").json()
    assert me["user"]["email"] == "owner@example.com"
    assert [t["name"] for t in me["tenants"]] == ["Sam & Alex"]


def test_bad_credentials_and_duplicate_signup(client, api):
    bad = client.post("/api/v1/auth/login", json={"email": api.email, "password": "nope-nope"})
    assert bad.status_code == 401
    again = client.post(
        "/api/v1/auth/signup",
        json={"email": api.email, "password": "whatever1", "full_name": "X", "account_name": "Y"},
    )
    assert again.status_code == 409


def test_tenant_header_is_required_and_membership_checked(client, api):
    no_tenant = client.get(
        "/api/v1/weddings", headers={"Authorization": api.headers["Authorization"]}
    )
    assert no_tenant.status_code == 400
    assert no_tenant.json()["code"] == "tenant_required"

    stranger = {**api.headers, "X-Tenant-ID": str(uuid.uuid4())}
    assert client.get("/api/v1/weddings", headers=stranger).status_code == 403
    assert client.get("/api/v1/weddings").status_code == 401


def test_tenants_cannot_see_each_others_data(client, api, wedding, day):
    guest = add_guest(api, wedding, "Jo", invitations=[{"event_id": day["id"]}])
    other = sign_up(client, "planner@example.com", "Other Weddings Ltd")

    assert other.get("/weddings").json() == []
    other.get(f"/weddings/{wedding['id']}", expected=404)
    other.get(f"/weddings/{wedding['id']}/guests", expected=404)
    other.get(f"/weddings/{wedding['id']}/guests/{guest['id']}", expected=404)
    other.patch(f"/weddings/{wedding['id']}", expected=404, json={"title": "Hijacked"})
    other.delete(f"/weddings/{wedding['id']}/guests/{guest['id']}", expected=404)
    other.get(f"/weddings/{wedding['id']}/events/{day['id']}/seating", expected=404)

    # The original tenant is untouched.
    assert api.get(f"/weddings/{wedding['id']}").json()["title"] == "Sam & Alex"


def test_user_can_belong_to_several_tenants(client, api):
    created = api.post("/tenants", expected=201, json={"name": "Second account"}).json()
    assert created["role"] == "owner"
    second = Api(client, {**api.headers, "X-Tenant-ID": created["id"]}, created["id"], api.email)
    second.post("/weddings", expected=201, json={"partner_one_name": "A", "partner_two_name": "B"})
    assert len(second.get("/weddings").json()) == 1
    assert api.get("/weddings").json() == []


def test_roles_limit_what_members_can_do(client, api, mailbox):
    token = invite(api, mailbox, "viewer@example.com", "viewer")
    client.post(
        f"/api/v1/public/invites/{token}/accept",
        json={"full_name": "Vee", "password": "viewer-pass"},
    )
    viewer = login_as(client, "viewer@example.com", "viewer-pass", api.tenant_id)
    viewer.get("/weddings")
    viewer.post("/weddings", expected=403, json={"partner_one_name": "A", "partner_two_name": "B"})
    viewer.post("/tenants/current/invites", expected=403, json={"email": "x@example.com"})
    viewer.get("/tenants/current/invites", expected=403)


def test_last_owner_cannot_be_removed_or_demoted(api):
    members = api.get("/tenants/current/members").json()
    owner = members[0]
    api.delete(f"/tenants/current/members/{owner['id']}", expected=409)
    api.patch(f"/tenants/current/members/{owner['id']}", expected=409, json={"role": "admin"})


def test_invited_newcomer_creates_a_login_and_joins(client, api, mailbox):
    token = invite(api, mailbox, "New.Person@example.com", "admin")
    message = mailbox.outbox[-1]
    assert message.to == "new.person@example.com"
    assert "Sam & Alex" in message.subject and "Test User" in message.subject

    pending = api.get("/tenants/current/invites").json()
    assert [(i["email"], i["role"], i["invited_by_name"]) for i in pending] == [
        ("new.person@example.com", "admin", "Test User")
    ]

    details = client.get(f"/api/v1/public/invites/{token}").json()
    assert details == {
        **details,
        "account_name": "Sam & Alex",
        "email": "new.person@example.com",
        "role": "admin",
        "has_account": False,
    }

    # A name and password are needed for someone without a login.
    missing = client.post(f"/api/v1/public/invites/{token}/accept", json={})
    assert missing.status_code == 400
    assert missing.json()["code"] == "new_user_details_required"

    accepted = client.post(
        f"/api/v1/public/invites/{token}/accept",
        json={"full_name": "New Person", "password": "a-fine-password"},
    )
    assert accepted.status_code == 200, accepted.text
    body = accepted.json()
    assert body["user"]["email"] == "new.person@example.com"
    assert [(t["name"], t["role"]) for t in body["tenants"]] == [("Sam & Alex", "admin")]

    # The link is spent and the invitation no longer shows as pending.
    assert client.get(f"/api/v1/public/invites/{token}").status_code == 404
    assert api.get("/tenants/current/invites").json() == []
    assert {m["email"] for m in api.get("/tenants/current/members").json()} == {
        "owner@example.com",
        "new.person@example.com",
    }


def test_existing_user_must_sign_in_to_accept(client, api, mailbox):
    planner = sign_up(client, "planner@example.com", "Planner Co")
    token = invite(api, mailbox, "planner@example.com")
    assert client.get(f"/api/v1/public/invites/{token}").json()["has_account"] is True

    anonymous = client.post(f"/api/v1/public/invites/{token}/accept", json={})
    assert anonymous.status_code == 401
    assert anonymous.json()["code"] == "sign_in_required"

    # Signed in as someone else: the invitation is not theirs to take.
    stranger = sign_up(client, "stranger@example.com", "Elsewhere")
    wrong = client.post(
        f"/api/v1/public/invites/{token}/accept",
        headers={"Authorization": stranger.headers["Authorization"]},
        json={},
    )
    assert wrong.status_code == 403
    assert wrong.json()["code"] == "invite_email_mismatch"

    joined = client.post(
        f"/api/v1/public/invites/{token}/accept",
        headers={"Authorization": planner.headers["Authorization"]},
        json={},
    )
    assert joined.status_code == 200
    assert {t["name"] for t in joined.json()["tenants"]} == {"Planner Co", "Sam & Alex"}


def test_invites_can_be_refreshed_revoked_and_expire(client, api, mailbox, session_factory):
    first = invite(api, mailbox, "late@example.com", "viewer")
    second = invite(api, mailbox, "late@example.com", "editor")
    # Re-inviting replaces the earlier link rather than adding a second invitation.
    assert client.get(f"/api/v1/public/invites/{first}").status_code == 404
    assert client.get(f"/api/v1/public/invites/{second}").json()["role"] == "editor"
    assert len(api.get("/tenants/current/invites").json()) == 1

    [pending] = api.get("/tenants/current/invites").json()
    api.delete(f"/tenants/current/invites/{pending['id']}")
    assert client.get(f"/api/v1/public/invites/{second}").status_code == 404

    third = invite(api, mailbox, "late@example.com")
    with session_factory() as db:
        db.query(MembershipInvite).update({"expires_at": datetime(2000, 1, 1, tzinfo=UTC)})
        db.commit()
    assert client.get(f"/api/v1/public/invites/{third}").status_code == 404
    assert api.get("/tenants/current/invites").json() == []


def test_cannot_invite_existing_member_or_owner_without_being_owner(client, api, mailbox):
    api.post("/tenants/current/invites", expected=409, json={"email": "owner@example.com"})

    token = invite(api, mailbox, "admin@example.com", "admin")
    client.post(
        f"/api/v1/public/invites/{token}/accept", json={"full_name": "Ad", "password": "admin-pass"}
    )
    admin = login_as(client, "admin@example.com", "admin-pass", api.tenant_id)
    admin.post("/tenants/current/invites", expected=201, json={"email": "e@example.com"})
    admin.post(
        "/tenants/current/invites", expected=403, json={"email": "o@example.com", "role": "owner"}
    )


def test_change_password_needs_the_current_one(client, api):
    wrong = api.post(
        "/auth/password",
        expected=400,
        json={"current_password": "not-it", "new_password": "brand-new-pass"},
    )
    assert wrong.json()["code"] == "wrong_password"
    api.post(
        "/auth/password",
        expected=204,
        json={"current_password": "correct-horse", "new_password": "brand-new-pass"},
    )
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": api.email, "password": "correct-horse"}
        ).status_code
        == 401
    )
    login_as(client, api.email, "brand-new-pass", api.tenant_id)


def test_password_reset_by_email(client, api, mailbox):
    # Unknown addresses get the same answer and no email.
    assert (
        client.post(
            "/api/v1/auth/forgot-password", json={"email": "nobody@example.com"}
        ).status_code
        == 202
    )
    assert mailbox.outbox == []

    assert (
        client.post("/api/v1/auth/forgot-password", json={"email": "OWNER@example.com"}).status_code
        == 202
    )
    token = link_in(mailbox.outbox[-1], "reset-password")

    bad = client.post(
        "/api/v1/auth/reset-password", json={"token": "nonsense", "new_password": "something-new"}
    )
    assert bad.status_code == 400 and bad.json()["code"] == "invalid_reset_token"

    done = client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": "something-new"}
    )
    assert done.status_code == 200 and "access_token" in done.json()
    login_as(client, api.email, "something-new", api.tenant_id)

    # Each link works once: the password changed, so the same token is now refused.
    again = client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": "third-password"}
    )
    assert again.status_code == 400


def test_reset_token_is_tied_to_the_password_it_was_issued_for(
    client, api, settings, session_factory
):
    with session_factory() as db:
        user = db.scalar(select(User).where(User.email == api.email))
        stale = create_password_reset_token(user.id, "some-older-hash", settings)
    refused = client.post(
        "/api/v1/auth/reset-password", json={"token": stale, "new_password": "whatever-new"}
    )
    assert refused.status_code == 400


def test_orm_scoping_filters_reads_and_bulk_deletes(client, session_factory, api, wedding):
    add_guest(api, wedding, "Mine")
    other = sign_up(client, "other@example.com", "Other")
    other_wedding = other.post(
        "/weddings", expected=201, json={"partner_one_name": "C", "partner_two_name": "D"}
    ).json()
    add_guest(other, other_wedding, "Theirs")

    with session_factory() as db:
        bind_tenant(db, uuid.UUID(api.tenant_id))
        assert [g.first_name for g in db.scalars(select(Guest))] == ["Mine"]
        assert db.scalar(select(func.count()).select_from(Guest)) == 1
        assert db.get(Wedding, uuid.UUID(other_wedding["id"])) is None
        db.execute(delete(Guest))
        db.commit()

    with session_factory() as db:
        remaining = [g.first_name for g in db.scalars(select(Guest))]
    assert remaining == ["Theirs"]


def test_orm_refuses_cross_tenant_writes(session_factory, api, wedding):
    with session_factory() as db:
        other_tenant = Tenant(name="Other", slug="other-tenant")
        db.add(other_tenant)
        db.commit()
        bind_tenant(db, uuid.UUID(api.tenant_id))
        db.add(
            Guest(
                tenant_id=other_tenant.id, wedding_id=uuid.UUID(wedding["id"]), first_name="Sneaky"
            )
        )
        with pytest.raises(PermissionError):
            db.flush()
