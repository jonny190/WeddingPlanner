#!/usr/bin/env python3
"""Post-deployment smoke test: drives a running stack through its public entrance (nginx).

    python3 deploy/smoke_test.py [http://localhost:8080] [http://localhost:8025]

Signs up, creates a wedding and a guest, sends the invitation, waits for the worker to
deliver it over SMTP (checked via Mailpit's API), then follows the tracked link to the
guest's RSVP page. Uses only the standard library.
"""

import json
import re
import sys
import time
import urllib.request
import uuid

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080").rstrip("/")
MAILPIT = (sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8025").rstrip("/")


def call(method: str, url: str, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    if data is not None:
        request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=15) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def wait_for(description: str, check, timeout: float = 60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            result = check()
            if result:
                return result
        except OSError:
            pass
        time.sleep(1)
    raise SystemExit(f"FAILED: timed out waiting for {description}")


def main() -> None:
    wait_for("the API", lambda: call("GET", f"{BASE}/api/health")["status"] == "ok")
    print("✓ API healthy through nginx")

    email = f"smoke-{uuid.uuid4().hex[:8]}@example.com"
    session = call("POST", f"{BASE}/api/v1/auth/signup", {
        "email": email, "password": "smoke-test-pass", "full_name": "Smoke Test",
        "account_name": "Smoke Test Weddings",
    })
    auth = {"Authorization": f"Bearer {session['access_token']}",
            "X-Tenant-ID": session["tenants"][0]["id"]}
    wedding = call("POST", f"{BASE}/api/v1/weddings",
                   {"partner_one_name": "Sam", "partner_two_name": "Alex"}, auth)
    day = wedding["events"][0]
    weddings = f"{BASE}/api/v1/weddings/{wedding['id']}"
    guest_email = f"guest-{uuid.uuid4().hex[:8]}@example.com"
    call("POST", f"{weddings}/guests", {
        "first_name": "Jo", "email": guest_email, "invitations": [{"event_id": day["id"]}],
    }, auth)
    print("✓ Signed up, created a wedding and a guest")

    drafts = f"{weddings}/events/{day['id']}/invitation-drafts"
    draft = call("POST", drafts, {"name": "Smoke test"}, auth)
    sent = call("POST", f"{drafts}/{draft['id']}/send", {"audience": "unsent"}, auth)
    assert len(sent["queued"]) == 1, sent
    print("✓ Invitation queued")

    def delivered():
        listing = call("GET", f"{MAILPIT}/api/v1/messages")
        for message in listing.get("messages", []):
            if any(to["Address"] == guest_email for to in message.get("To", [])):
                return call("GET", f"{MAILPIT}/api/v1/message/{message['ID']}")
        return None

    message = wait_for("the worker to deliver the email", delivered)
    print("✓ Worker delivered the email over SMTP")

    token = re.search(r"/i/([A-Za-z0-9_\-]+)", message["Text"]).group(1)
    opened = call("POST", f"{BASE}/api/v1/public/links/{token}/open")
    view = call("GET", f"{BASE}/api/v1/public/rsvp/{opened['rsvp_token']}")
    assert [e["name"] for e in view["events"]] == [day["name"]], view
    assert view["events"][0]["card"]["layers"], "the designed card is missing"
    print("✓ Tracked link opens the guest's RSVP page with their card")

    with urllib.request.urlopen(f"{BASE}/rsvp/{opened['rsvp_token']}", timeout=15) as page:
        assert b'<div id="root">' in page.read()
    print("✓ Web app served for RSVP links")
    print("Smoke test passed.")


if __name__ == "__main__":
    main()
