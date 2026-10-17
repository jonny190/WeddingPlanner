# API keys and AI agents

An API key lets software work in your account for you: an AI agent such as Hermes, a script,
or anything else that speaks to the planner directly. The agent can then answer questions
("who hasn't replied for the evening?"), make changes ("add Priya to the day and give her a
plus-one"), and, if you allow it, send invitations.

A key can never do more than you can, and you decide at creation whether it may make changes
or send email.

## Creating a key

1. Open the account page from the menu at the top right.
2. Under API keys, give the key a name you will recognise, such as the agent it is for.
3. Choose what it may do:
   - Leave both boxes clear for a key that can only look things up.
   - Tick **Can make changes** to let it add and edit guests, seating, menus and invitation
     drafts. It still cannot send anything.
   - Tick **Can send email** as well to let it send invitations and reminders to guests, test
     emails, and invitations to join the account. Most people start without this and turn it
     on later if they want the agent to send reminders.
4. Pick when it expires, if you like, and choose Create key.

Copy the key straight away. It is shown once; if you lose it, revoke it and make another.

Keys belong to the account you were in when you made them. If you work in several accounts,
make a key in each.

## Connecting Hermes

Put the key somewhere Hermes can read it, in `~/.hermes/.env`:

```
WEDDING_PLANNER_API_KEY=wp_...
```

Add the server to `~/.hermes/config.yaml`, using your own address:

```yaml
mcp_servers:
  wedding_planner:
    url: "https://weddings.example.com/api/mcp"
    headers:
      Authorization: "Bearer ${WEDDING_PLANNER_API_KEY}"
```

Run `/reload-mcp` in Hermes, and it will have tools such as `list_weddings`, `list_guests`,
`list_replies`, `get_seating_plan`, `auto_arrange_seating` and `send_invitations`. The account
page shows this snippet, with your address filled in, when you create a key.

Other MCP clients need the same two things: the URL and the `Authorization` header.

## What to expect from the agent

- Ask it to start with the wedding and its events; everything else refers to those.
- It sees exactly what you see in this account and nothing from any other account.
- With a read-only key, any attempt to change something is refused with a message saying the
  key is read-only.
- `send_invitations` is a dry run unless the agent explicitly asks to send, which it can only
  do with a key that may send email. The server also asks the agent to tell you who will
  receive what, and to check with you, before sending or deleting.

## Revoking a key

On the account page, choose the bin icon next to the key. Anything using it stops working at
once. Admins and owners can see and revoke every key in the account; other members see only
their own. If someone leaves the account, their keys for it are removed with them.

## Using the key without an agent

The key also works with the ordinary API, which the web app itself uses. Send it as
`Authorization: Bearer wp_...` on requests to `/api/v1/...`; the `X-Tenant-ID` header the web
app sends is not needed, because the key already names the account. The interactive
reference is at `/api/docs` on your deployment.
