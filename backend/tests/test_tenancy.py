import uuid

import pytest
from sqlalchemy import delete, func, select

from app.core.db import bind_tenant
from app.modules.guests.models import Guest
from app.modules.tenancy.models import Tenant
from app.modules.weddings.models import Wedding
from tests.conftest import Api, add_guest, sign_up


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


def test_roles_limit_what_members_can_do(client, api):
    api.post(
        "/tenants/current/members",
        expected=201,
        json={
            "email": "viewer@example.com",
            "role": "viewer",
            "full_name": "Vee",
            "password": "viewer-pass",
        },
    )
    login = client.post(
        "/api/v1/auth/login", json={"email": "viewer@example.com", "password": "viewer-pass"}
    ).json()
    viewer = Api(
        client,
        {"Authorization": f"Bearer {login['access_token']}", "X-Tenant-ID": api.tenant_id},
        api.tenant_id,
        "viewer@example.com",
    )
    viewer.get("/weddings")
    viewer.post("/weddings", expected=403, json={"partner_one_name": "A", "partner_two_name": "B"})
    viewer.post("/tenants/current/members", expected=403, json={"email": "x@example.com"})


def test_last_owner_cannot_be_removed_or_demoted(api):
    members = api.get("/tenants/current/members").json()
    owner = members[0]
    api.delete(f"/tenants/current/members/{owner['id']}", expected=409)
    api.patch(f"/tenants/current/members/{owner['id']}", expected=409, json={"role": "admin"})


def test_adding_new_member_requires_name_and_password(api):
    response = api.post("/tenants/current/members", expected=400, json={"email": "new@example.com"})
    assert response.json()["code"] == "new_user_details_required"


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
