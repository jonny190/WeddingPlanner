"""Test fixtures. Runs on in-memory SQLite by default; set TEST_DATABASE_URL to use PostgreSQL."""

import os
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.core.db import Base, create_db_engine
from app.main import create_app
from app.modules import installed_modules
from app.modules.invitations.dispatcher import dispatch_due_deliveries
from app.modules.notifications.email import MemoryEmailBackend
from app.modules.notifications.whatsapp import MemoryWhatsAppBackend

# 1x1 transparent PNG
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        database_url=os.environ.get("TEST_DATABASE_URL", "sqlite://"),
        environment="test",
        secret_key="test-secret-key-that-is-at-least-32-bytes-long",
        public_app_url="https://app.test",
        media_root=str(tmp_path / "media"),
        delivery_max_attempts=2,
    )


@pytest.fixture
def engine(settings):
    installed_modules()
    if settings.database_url.startswith("sqlite"):
        engine = create_db_engine(settings.database_url, poolclass=StaticPool)
    else:
        engine = create_db_engine(settings.database_url)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def session_factory(engine):
    return sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
def mailbox() -> MemoryEmailBackend:
    """Where the API's own emails land (member invitations, password resets)."""
    return MemoryEmailBackend()


@pytest.fixture
def whatsapp() -> MemoryWhatsAppBackend:
    """A connected WhatsApp bridge that keeps messages in memory."""
    return MemoryWhatsAppBackend()


@pytest.fixture
def client(settings, engine, mailbox, whatsapp):
    app = create_app(settings, engine, email_backend=mailbox, whatsapp_backend=whatsapp)
    with TestClient(app) as client:
        yield client


@dataclass
class Api:
    """A signed-in user acting within one tenant."""

    client: TestClient
    headers: dict[str, str]
    tenant_id: str
    email: str

    def _call(self, method: str, url: str, expected: int | None, **kwargs):
        response = self.client.request(method, f"/api/v1{url}", headers=self.headers, **kwargs)
        if expected is not None:
            assert response.status_code == expected, response.text
        return response

    def get(self, url, expected=200, **kw):
        return self._call("GET", url, expected, **kw)

    def post(self, url, expected=200, **kw):
        return self._call("POST", url, expected, **kw)

    def put(self, url, expected=200, **kw):
        return self._call("PUT", url, expected, **kw)

    def patch(self, url, expected=200, **kw):
        return self._call("PATCH", url, expected, **kw)

    def delete(self, url, expected=204, **kw):
        return self._call("DELETE", url, expected, **kw)


def sign_up(client: TestClient, email: str, account: str) -> Api:
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "email": email,
            "password": "correct-horse",
            "full_name": "Test User",
            "account_name": account,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    tenant_id = body["tenants"][0]["id"]
    return Api(
        client=client,
        headers={"Authorization": f"Bearer {body['access_token']}", "X-Tenant-ID": tenant_id},
        tenant_id=tenant_id,
        email=email,
    )


@pytest.fixture
def api(client) -> Api:
    return sign_up(client, "owner@example.com", "Sam & Alex")


@pytest.fixture
def wedding(api) -> dict:
    return api.post(
        "/weddings",
        expected=201,
        json={
            "partner_one_name": "Sam",
            "partner_two_name": "Alex",
            "wedding_date": "2027-06-12",
            "contact_email": "couple@example.com",
        },
    ).json()


@pytest.fixture
def day(wedding) -> dict:
    return next(e for e in wedding["events"] if e["kind"] == "day")


@pytest.fixture
def evening(wedding) -> dict:
    return next(e for e in wedding["events"] if e["kind"] == "evening")


def add_guest(api: Api, wedding: dict, first: str, last: str = "Guest", **fields) -> dict:
    payload = {"first_name": first, "last_name": last, **fields}
    return api.post(f"/weddings/{wedding['id']}/guests", expected=201, json=payload).json()


@pytest.fixture
def outbox(session_factory, settings, whatsapp):
    """In-memory mailbox plus a `deliver()` that runs one worker pass (email and WhatsApp)."""

    class Outbox(MemoryEmailBackend):
        def deliver(self) -> int:
            return dispatch_due_deliveries(session_factory, self, settings, whatsapp)

    return Outbox()
