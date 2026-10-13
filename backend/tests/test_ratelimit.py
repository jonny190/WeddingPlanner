"""Abuse limits on the routes anyone can reach."""

from app.core.config import Settings
from app.core.errors import TooManyRequests
from app.core.ratelimit import RateLimiter


def test_limiter_counts_a_sliding_window():
    now = [0.0]
    limiter = RateLimiter(clock=lambda: now[0])
    for _ in range(3):
        limiter.check("auth", "1.2.3.4", 3, 60)
    try:
        limiter.check("auth", "1.2.3.4", 3, 60)
    except TooManyRequests as exc:
        assert exc.retry_after == 61
    else:
        raise AssertionError("fourth request should have been refused")
    # Other clients and other buckets are unaffected.
    limiter.check("auth", "5.6.7.8", 3, 60)
    limiter.check("public", "1.2.3.4", 3, 60)
    # The window slides: a minute later the client is allowed again.
    now[0] = 61
    limiter.check("auth", "1.2.3.4", 3, 60)
    # A limit of 0 means no limit.
    for _ in range(10):
        limiter.check("auth", "1.2.3.4", 0, 60)


def test_login_attempts_are_limited(engine, tmp_path):
    from fastapi.testclient import TestClient

    from app.main import create_app

    settings = Settings(
        database_url="sqlite://",
        environment="test",
        secret_key="test-secret-key-that-is-at-least-32-bytes-long",
        media_root=str(tmp_path),
        rate_limit_auth_per_minute=3,
    )
    with TestClient(create_app(settings, engine)) as client:
        payload = {"email": "nobody@example.com", "password": "guess"}
        statuses = [client.post("/api/v1/auth/login", json=payload).status_code for _ in range(4)]
        assert statuses == [401, 401, 401, 429]
        refused = client.post("/api/v1/auth/login", json=payload)
        assert refused.json()["code"] == "rate_limited"
        assert refused.headers["Retry-After"].isdigit()


def test_test_sends_are_limited_per_user(api, wedding, day, settings, client):
    client.app.state.settings = settings.model_copy(update={"rate_limit_email_per_hour": 2})
    drafts = f"/weddings/{wedding['id']}/events/{day['id']}/invitation-drafts"
    draft = api.post(drafts, expected=201, json={"name": "Main"}).json()
    body = {"email": "me@example.com"}
    api.post(f"{drafts}/{draft['id']}/send-test", expected=202, json=body)
    api.post(f"{drafts}/{draft['id']}/send-test", expected=202, json=body)
    api.post(f"{drafts}/{draft['id']}/send-test", expected=429, json=body)
    # Invitations to join the account share the same per-user email budget.
    api.post("/tenants/current/invites", expected=429, json={"email": "x@example.com"})
