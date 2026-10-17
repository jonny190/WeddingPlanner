"""The MCP server at /api/mcp, driven the way an agent drives it: one JSON-RPC request per
call, each carrying an API key. The transport is stateless, so no initialize handshake or
session is needed between calls."""

from fastapi.testclient import TestClient

from tests.conftest import add_guest, sign_up
from tests.test_api_keys import as_key, make_key

MCP_HEADERS = {
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-06-18",
}


def rpc(client: TestClient, key: str | None, method: str, params: dict | None = None) -> dict:
    headers = dict(MCP_HEADERS)
    if key:
        headers["Authorization"] = f"Bearer {key}"
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    response = client.post("/api/mcp", json=body, headers=headers)
    assert response.status_code in (200, 401), response.text
    return {"status": response.status_code, **response.json()}


def call(client: TestClient, key: str, tool: str, **arguments):
    """Call a tool and return (error text or None, structured result)."""
    reply = rpc(client, key, "tools/call", {"name": tool, "arguments": arguments})
    result = reply["result"]
    text = "\n".join(c.get("text", "") for c in result.get("content", []))
    if result.get("isError"):
        return text, None
    structured = result.get("structuredContent")
    if isinstance(structured, dict) and set(structured) == {"result"}:
        structured = structured["result"]
    return None, structured


def test_tools_are_only_listed_to_a_valid_key(client, api):
    assert rpc(client, None, "tools/list")["status"] == 401
    assert rpc(client, "wp_bogus", "tools/list")["status"] == 401
    reply = rpc(client, make_key(api)["key"], "tools/list")
    names = {t["name"] for t in reply["result"]["tools"]}
    assert {
        "whoami",
        "list_weddings",
        "list_guests",
        "get_seating_plan",
        "send_invitations",
    } <= names
    # Agents are told how to behave in the server's instructions.
    init = rpc(
        client,
        make_key(api)["key"],
        "initialize",
        {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "t", "version": "1"},
        },
    )
    assert "dry run" in init["result"]["instructions"]


def test_tools_work_inside_the_keys_account_only(client, api, wedding):
    other = sign_up(client, "other@example.com", "Other Weddings")
    other.post("/weddings", expected=201, json={"partner_one_name": "C", "partner_two_name": "D"})

    mine = make_key(api)["key"]
    error, who = call(client, mine, "whoami")
    assert error is None
    assert who["account_name"] == "Sam & Alex" and who["can_make_changes"] is False
    error, weddings = call(client, mine, "list_weddings")
    assert [w["id"] for w in weddings] == [wedding["id"]]
    assert [e["kind"] for e in weddings[0]["events"]] == ["day", "evening"]

    theirs = make_key(other)["key"]
    error, _ = call(client, theirs, "get_wedding", wedding_id=wedding["id"])
    assert error and "not found" in error.lower()
    error, theirs_list = call(client, theirs, "list_weddings")
    assert [w["couple_names"] for w in theirs_list] == ["C & D"]


def test_read_only_key_is_refused_for_changes(client, api, wedding):
    reader = make_key(api, can_write=False)["key"]
    error, _ = call(client, reader, "add_guest", wedding_id=wedding["id"], first_name="Jo")
    assert error and "read-only" in error
    error, guests = call(client, reader, "list_guests", wedding_id=wedding["id"])
    assert error is None and guests == []


def test_an_agent_can_run_the_guest_list_and_seating(client, api, wedding, day):
    key = make_key(api, can_write=True)["key"]
    W = wedding["id"]
    for name in ("Ann", "Ben", "Cat"):
        error, guest = call(
            client,
            key,
            "add_guest",
            wedding_id=W,
            first_name=name,
            last_name="Guest",
            invitations=[{"event_id": day["id"], "plus_one_allowed": name == "Ann"}],
        )
        assert error is None, error
    error, guests = call(client, key, "list_guests", wedding_id=W, event_id=day["id"])
    assert [g["first_name"] for g in guests] == ["Ann", "Ben", "Cat"]
    ann, ben = guests[0], guests[1]

    error, rule = call(
        client, key, "add_seating_rule", wedding_id=W, guest_a_id=ann["id"], guest_b_id=ben["id"]
    )
    assert error is None and rule["kind"] == "apart"
    error, tables = call(
        client, key, "set_up_tables", wedding_id=W, event_id=day["id"], count=2, capacity=3
    )
    assert error is None and len(tables) == 2
    error, arranged = call(client, key, "auto_arrange_seating", wedding_id=W, event_id=day["id"])
    assert error is None and arranged["unplaced"] == []
    plan = arranged["plan"]
    assert plan["stats"]["guests_unassigned"] == 0 and plan["violations"] == []
    table_of = {g["guest_id"]: t["id"] for t in plan["tables"] for g in t["guests"]}
    assert table_of[ann["id"]] != table_of[ben["id"]]

    # Service errors come back as readable tool errors, not crashes.
    error, _ = call(
        client, key, "get_guest", wedding_id=W, guest_id="00000000-0000-0000-0000-000000000000"
    )
    assert error and "Guest not found" in error


def test_sending_email_needs_a_key_that_may_send(client, api, wedding, day, outbox):
    add_guest(api, wedding, "Jo", email="jo@example.com", invitations=[{"event_id": day["id"]}])
    writer = make_key(api, can_write=True)["key"]
    error, draft = call(
        client, writer, "create_draft", wedding_id=wedding["id"], event_id=day["id"]
    )
    assert error is None and "{{" in draft["subject"]
    error, preview = call(
        client,
        writer,
        "preview_draft",
        wedding_id=wedding["id"],
        event_id=day["id"],
        draft_id=draft["id"],
    )
    assert error is None and "Sam & Alex" in preview["subject"]
    send = dict(wedding_id=wedding["id"], event_id=day["id"], draft_id=draft["id"])
    error, dry = call(client, writer, "send_invitations", **send)
    assert error is None and dry["dry_run"] is True and len(dry["queued"]) == 1
    error, _ = call(client, writer, "send_invitations", dry_run=False, **send)
    assert error and "send email" in error

    sender = make_key(api, can_write=True, can_send=True)["key"]
    error, sent = call(client, sender, "send_invitations", dry_run=False, **send)
    assert error is None and sent["dry_run"] is False
    assert outbox.deliver() == 1
    error, deliveries = call(client, sender, "list_deliveries", wedding_id=wedding["id"])
    assert [d["status"] for d in deliveries] == ["sent"]


def test_the_rest_api_and_mcp_agree(client, api, wedding):
    """The same key, through either door, sees the same account."""
    key = make_key(api)["key"]
    error, via_mcp = call(client, key, "wedding_summary", wedding_id=wedding["id"])
    via_rest = as_key(api, key).get(f"/weddings/{wedding['id']}/summary").json()
    assert error is None and via_mcp["guests_total"] == via_rest["guests_total"] == 0


def test_an_agent_can_track_venues_and_choose_one(client, api, wedding, day):
    key = make_key(api, can_write=True)["key"]
    error, venue = call(
        client,
        key,
        "add_venue",
        wedding_id=wedding["id"],
        name="Hartwell Manor",
        address="Hartwell Lane, Cotswolds, GL54 1AA",
        price=6500,
        price_per_head=95,
        contacts=[{"name": "Priya Shah", "role": "Events coordinator"}],
    )
    assert error is None, error
    assert venue["contacts"][0]["name"] == "Priya Shah"
    error, event = call(
        client,
        key,
        "choose_venue",
        wedding_id=wedding["id"],
        event_id=day["id"],
        venue_id=venue["id"],
    )
    assert error is None and event["venue_name"] == "Hartwell Manor"
    error, venues = call(client, key, "list_venues", wedding_id=wedding["id"])
    assert venues[0]["used_for"] == [{"event_id": day["id"], "event_name": "Wedding Day"}]
    error, booked = call(
        client, key, "update_venue", wedding_id=wedding["id"], venue_id=venue["id"], status="booked"
    )
    assert error is None and booked["status"] == "booked"
