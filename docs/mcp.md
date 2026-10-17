# API keys and the MCP server

How software other than the web app, an AI agent in particular, works inside one account.
These notes are for whoever changes this next. The user-facing instructions are in
`guides/api-keys-and-agents.md`.

## Two doors, one lock

There are two ways in:

- **The REST API** under `/api/v1`, the same one the web app uses.
- **The MCP server** at `/api/mcp`, which offers the planner as tools to an agent such as
  Hermes (`backend/app/modules/mcp/`).

Both are opened with an **API key** (`backend/app/modules/tenancy/api_keys.py`). A key is a
member's credential for one account: it is created by a signed-in member for themselves,
bound to the account they were working in, and can never do more than that member could.
Only a SHA-256 hash of the secret is stored; the secret is returned once at creation and the
first eleven characters (`wp_` plus eight) are kept to tell keys apart.

A key carries two permissions chosen when it is made:

| Permission | Without it | With it |
|---|---|---|
| `can_write` | The key acts as a viewer, whatever its owner's role | The key acts with its owner's role |
| `can_send` | Nothing the key does may queue email | Sending invitations, test sends and member invitations are allowed |

`can_send` needs `can_write`. A viewer cannot make a key that writes. Keys can be listed and
revoked from the account page: members see their own, admins and owners see everyone's.
Removing a member deletes their keys for that account. Keys can only be created or revoked
from a login session, never with another key.

## How a key becomes a tenant context

`context_for(db, key)` in `api_keys.py` is the one place a key is turned into a
`TenantContext`. It checks the owner is still a member of the account, calls `bind_tenant`
so every query on the session is filtered to that account, and returns the context with the
role capped to viewer unless the key may write, plus `can_send` and `api_key_id`.

- The REST dependencies (`tenancy/deps.py`) recognise a `wp_` bearer token, resolve it and
  call `context_for`. The `X-Tenant-ID` header is optional for a key and must match the key's
  account if sent.
- The MCP tools call the same two functions at the start of every tool call.

The endpoints that queue email call `ctx.require_send()`: sending a draft for real, test
sends, retrying failed deliveries, and inviting a member. A dry run does not need it.

## The MCP server

`backend/app/modules/mcp/server.py` builds an `MCPServer` from the official `mcp` SDK and
registers the tools in `tools.py`. The module's `install` hook mounts the server's ASGI app at
`/api/mcp` on the API and returns the session manager's lifespan, which the app factory runs
alongside the application (`app/core/modules.py`, `app/main.py`).

Three choices matter:

1. **Stateless, JSON replies.** `streamable_http_app(stateless_http=True, json_response=True)`.
   The API runs several uvicorn workers behind nginx, so nothing can live in one process's
   memory between requests. Every request stands alone and carries the key, and the client
   gets a plain JSON reply rather than an event stream. The cost is that server-initiated
   features (sampling, elicitation) are unavailable, which the tools do not need.
2. **The key is checked twice.** `ApiKeyGate` is an ASGI middleware in front of the server
   that refuses any request without a valid key with a 401, so the tool list is never shown
   to anonymous callers. Then each tool reads the key again from `ctx.headers` and opens its
   own database session through `Accounts.open`, because the SDK gives a tool its request
   headers but no other request state. The second lookup is a hash and an indexed select.
3. **DNS rebinding protection is off.** The SDK's protection exists for servers that trust
   the caller by origin. Here every request must carry a bearer key, which a rebinding
   attacker's page cannot supply, and the public domain is not known at build time.

Tools are thin: they parse arguments into the same Pydantic schemas the REST API uses, call
the service function, and return the same read schemas, which the SDK turns into structured
content. Service errors (`AppError`) become `ToolError`s with the same message, so the agent
sees "Guest not found" rather than a stack trace. Tools that change data open the account with
`Role.editor`, which a read-only key fails with a message saying so.

The server's `instructions` (sent to the agent at initialize) explain the account model and
ask the agent to dry-run and confirm before sending email or deleting guests.

### Adding a tool

```python
@mcp.tool()
def list_things(wedding_id: uuid.UUID, ctx: Context) -> list[ThingRead]:
    """What the agent reads to decide whether to call this. Say if it changes data."""
    with accounts.open(ctx) as (db, tenant):          # Role.editor for changes
        return [ThingRead.model_validate(t) for t in things.list_things(db, wedding_id)]
```

Keep `ctx: Context` in the signature (the SDK fills it and hides it from the schema), build
results inside the `with` block (the session closes on exit), and prefer the existing read
schemas as return types.

## Talking to it without an MCP client

In stateless mode a single POST does a call. No `initialize` is needed first.

```bash
curl -s https://weddings.example.com/api/mcp \
  -H "Authorization: Bearer wp_..." \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_weddings","arguments":{}}}'
```

`tests/test_mcp.py` drives the server this way, and `e2e/tests/api-keys.spec.ts` creates a
key in the browser and calls the server with it. `deploy/smoke_test.py` does the same against
a running Docker stack.
