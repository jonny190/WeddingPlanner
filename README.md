# Wedding Planner

A multi-tenant SaaS for planning weddings. It covers guest lists with independent day/evening
invitations and plus-ones, room layouts and seating rules, designed digital invitations that
are drafted, previewed and emailed, and RSVP tracking that shows who opened their invitation
but hasn't replied yet.

| | |
|---|---|
| **Backend** | Python 3.12 · FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL 16 |
| **Frontend** | React 19 · TypeScript · Vite · TanStack Query |
| **Runtime** | Docker Compose: `web` (nginx) · `api` · `worker` · `migrate` · `db` (+ `mailpit` in dev, `caddy` for HTTPS) |

## Quick start

```bash
cp .env.example .env      # optional: every setting has a development default
make up                   # docker compose --profile dev up -d --build
make seed                 # demo account: demo@example.com / demo-password
```

| URL | What |
|---|---|
| http://localhost:8080 | The web app |
| http://localhost:8080/api/docs | Interactive API docs (OpenAPI) |
| http://localhost:8025 | Mailpit, which catches every email sent in development |

Other commands: `make logs`, `make down`, `make test`, `make psql`.

## Deploying

Any Linux server with Docker works: a small VM is plenty to start with.

```bash
git clone https://github.com/jonny190/WeddingPlanner.git && cd WeddingPlanner
cp .env.example .env
#   ENVIRONMENT=production
#   SECRET_KEY=$(openssl rand -hex 32)
#   POSTGRES_PASSWORD=<strong password>
#   DOMAIN=weddings.example.com   PUBLIC_APP_URL=https://weddings.example.com
#   WEB_BIND=127.0.0.1            SMTP_HOST / SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD / EMAIL_FROM
docker compose --profile tls up -d --build
```

The `tls` profile adds Caddy, which gets and renews a Let's Encrypt certificate for
`$DOMAIN`. Point the domain's DNS at the server and open ports 80 and 443 first. If TLS is
already handled by a load balancer, drop `--profile tls` and send traffic to `WEB_PORT`.

To update, run `git pull && docker compose --profile tls up -d --build`. Migrations run
automatically before the new API starts.

## Features

- **Accounts (tenants)**: sign up as a couple or a planning business. One account can hold
  many weddings. Users can belong to several accounts with a role in each:
  owner, admin, editor or viewer. New members are **invited by email** and join only when
  they open the link, so nobody is added to an account without agreeing to it. Passwords can
  be changed from the account page or **reset by email** when forgotten.
- **Guests**: a guest list with groups, age groups, dietary needs, CSV import and export.
  Every guest is invited **independently** to each event (day, evening, or custom events),
  with a separate **plus-one** allowance per event.
- **Seating**: configure each event's room in one step ("12 tables × 10 seats") or table by
  table. Record pairs who **must not sit together** (or must sit together); these rules
  apply to every event. Drag guests between tables (plus-ones take their seat automatically),
  lock seats, and let **auto-arrange** produce a draft plan. It never breaks a rule, keeps
  groups together where it can, and explains anyone it couldn't place.
- **Invitation designer**: design the card on a canvas. Text and image layers can be placed
  anywhere, with curated Google Fonts, colours, sizes, letter spacing, rotation, background
  images and frames. Text can include placeholders like `{{first_name}}` and `{{event_when}}`.
  Each draft also styles its email (header image, colours, font and button text) and the
  envelope guests open on their page (paper, wax and ink colours, the initials on the wax, the
  stamp and the prompt), with a preview that plays in the builder.
- **Drafts, preview and send**: preview as any guest, send yourself a test, then send to an
  audience: not yet sent, no reply, opened but no reply, never opened, everyone, or chosen
  guests. A dry run lists recipients and anyone without an email. Emails go through a
  background worker with retries, and posted invitations can be marked as sent.
- **Menus**: each event can have its own menu of courses and dishes. Guests choose for
  themselves and for their plus-one when they accept, the couple sees a count per dish and
  who is having what, can record choices taken by phone, and exports a list for the caterer.
- **RSVP and replies**: each guest gets a personal page: a parchment envelope addressed to
  them in green ink, which turns over, and opens at the wax seal to one letter: the couple's
  note, their personalised card for every event they've been sent, a hand-written sign-off,
  and a reply slip (plus-one name, dietary needs, message).
  Couples see per-event dashboards with headcounts and dietary lists, can record replies
  received by phone or post, and can export to CSV.
- **Venues**: track every venue being considered, with status, address, website, email and
  phone, capacity, prices (hire, per head, deposit) and notes, and up to ten contacts each.
  Choosing a venue for an event puts its name and address on the invitations, on the guest's
  page and in the calendar entry guests add from their invitation; `{{calendar_link}}` puts
  that link in the email too.
- **WhatsApp**: guests with a mobile can get their invitation as a WhatsApp message with the
  same personal link, through a self-hosted bridge (optional, and unofficial: see
  `docs/whatsapp.md`). Each draft has a WhatsApp message next to its email, and sending offers
  email, WhatsApp, or WhatsApp with email as the fallback.
- **Agents and integrations**: members create **API keys** for software that works in the
  account on their behalf, such as an AI agent. A key is bound to one account and to its
  owner's role, and is read-only unless allowed to make changes, with sending email a further
  opt-in. The REST API accepts keys, and an **MCP server** at `/api/mcp` offers the planner as
  tools to agents such as Hermes: guests, replies, seating, menus, drafts and sending, each
  call authenticated by the key.
- **Click tracking**: each email carries a unique link. Opening it records the click against
  that guest and event. The replies view shows *opened, no reply*, and you can send a
  reminder to exactly those guests.

## Architecture

```
            ┌───────────── web (nginx) ─────────────┐
 browser ──▶│  React SPA     /api/* ──▶ api:8000     │
            └───────────────────────────┬────────────┘
                                        ▼
                     api (FastAPI) ──▶ db (PostgreSQL) ◀── worker ──▶ SMTP (Mailpit in dev)
                          │                                  ▲
                   media volume                 invitation_deliveries
                 (uploaded images)              (outbox, row-locked)
```

- **`migrate`** runs `alembic upgrade head` once. `api` and `worker` start only after it
  succeeds.
- **`worker`** sends queued invitation emails. It claims rows with
  `SELECT … FOR UPDATE SKIP LOCKED`, so `docker compose up --scale worker=3` is safe. Failed
  sends retry with backoff, and a worker that dies mid-send has its rows re-queued.
- **`web`** serves the built SPA and proxies `/api` to the API, so browser and API share one
  origin.

### Backend modules

Each feature is a self-contained package under `backend/app/modules/<name>/` with the same
layout: `models.py` (tables), `schemas.py` (API contracts), `service.py` (business logic),
`router.py` (HTTP), and `module.py` (registration and dependencies).

| Module | Responsibility | Depends on |
|---|---|---|
| `notifications` | Email transports (SMTP, console, file, in-memory for tests) and WhatsApp bridges (WAHA, console, file, in-memory) | – |
| `tenancy` | Tenants, users, memberships, invitations, password resets, API keys, JWT auth, tenant-scoping dependencies | notifications |
| `weddings` | Weddings, their events (day, evening, other), and venues (`venues.py`) with the venue chosen for each event | tenancy |
| `guests` | Guests, per-event invitations and plus-ones, CSV import/export | weddings |
| `media` | Image uploads (sniffed by content, never SVG) and public serving | weddings |
| `seating` | Tables, seating rules, assignments, the auto-arrange solver (`solver.py`) | guests |
| `menus` | Courses and dishes per event, and what each guest and plus-one chose | guests |
| `invitations` | Card design format (`design.py`), drafts, rendering, sending, delivery worker, link tracking | guests, media, notifications |
| `rsvp` | Public RSVP pages (with the menu and dish choices), replies dashboards, engagement, manual replies | menus, invitations |
| `mcp` | The MCP server at `/api/mcp`: the planner as tools for agents, authenticated by API key | tenancy, weddings, guests, seating, menus, invitations, rsvp |

`app/modules/__init__.py` lists the installed modules in dependency order. The app factory
mounts each module's `router` under `/api/v1` and its `public_router` (no auth) under
`/api/v1/public`, and refuses to start if a dependency is missing.

**Adding a module**:

1. Create `app/modules/<name>/` with `models.py`, `schemas.py`, `service.py`, `router.py`,
   and `module.py` exporting `module = Module(name=..., router=..., depends_on=(...))`.
2. Make tenant-owned tables inherit `TenantScoped`.
3. Add it to `installed_modules()`.
4. Run `alembic revision --autogenerate -m "<name>"`.

### Multi-tenancy

All tenant data lives in shared tables with a `tenant_id` column (`TenantScoped` mixin).
Isolation is enforced centrally in `app/core/db.py`, not left to each query:

- After a request's membership is verified, `bind_tenant()` attaches the tenant to the
  database session. A SQLAlchemy hook then adds `tenant_id = …` to **every** ORM `SELECT`,
  `UPDATE` and `DELETE` on tenant-scoped models, including relationship loads.
- New rows are stamped with the tenant on flush. Writing a row that belongs to another tenant
  raises an error.
- Public endpoints (RSVP pages, tracked links, images, invitation links) are addressed by
  unguessable tokens or UUIDs. They bind the owning tenant once the token resolves.

`tests/test_tenancy.py` checks isolation through both the API and the ORM, and the
end-to-end suite checks it through the browser.

### Abuse limits

`app/core/ratelimit.py` is a small in-process limiter. Sign in, sign up and forgotten-password
requests are limited per client address, as are the guest-facing routes (RSVP pages, tracked
links, calendar files, invitation links). Test sends and member invitations are limited per
user, because both send email to an address of the caller's choosing. Refused requests get a
429 with a `Retry-After` header. Each API process keeps its own counts, so the effective
limit is the configured number multiplied by `WEB_CONCURRENCY`. See `docs/security.md`.

### API keys and the MCP server

An API key (`app/modules/tenancy/api_keys.py`) is a member's long-lived credential for one
account: hashed at rest, shown once, read-only unless it may write, and never able to queue
email unless it may send. The REST dependencies accept it in place of a login token and bind
its account without needing `X-Tenant-ID`. The MCP server (`app/modules/mcp/`) exposes the
same service functions as tools, re-reads the key on every call to bind the account, and is
stateless so it works behind several API processes. See `docs/mcp.md`.

### Invitations, designs and tracking

1. A **draft** belongs to one event. It holds an email subject and body (with
   `{{placeholders}}`) and a **design**: a validated JSON document describing the card
   (aspect ratio, background, positioned text and image layers) plus the email's styling.
   Positions are percentages and font sizes are relative to a 600px-wide card, so a design
   renders the same at any size.
2. **Sending** renders a personalised email per guest, each with its own tracking token, and
   queues it in `invitation_deliveries`. The worker delivers it.
3. The card's typefaces are bundled with the web app (`@fontsource` packages, see
   `frontend/src/modules/invitations/designer/webfonts.ts`), so guests' browsers never
   contact Google Fonts. Email clients strip the CSS that free-form layouts need, so the
   email itself is a styled message with a button. The button goes to `/i/<token>`. The web app records the click
   (`POST /api/v1/public/links/<token>/open`) and redirects to the guest's RSVP page, where the
   **designed card is shown personalised** above the reply form.
4. Clicks are de-duplicated within 30 seconds and stored with a timestamp and user agent only,
   with no IP address. Each invitation's engagement is *not sent → sent → opened → replied*.

### Seating solver

`app/modules/seating/solver.py` is a pure function with its own unit tests:

- "Seat together" rules (and plus-ones) merge guests into clusters.
- A backtracking search places the clusters, trying a group-friendly order first, then
  hardest-first, each within a step budget.
- If neither finishes, a greedy pass seats as many guests as possible and explains why the
  rest couldn't be placed.
- Locked seats are kept.

Capacity and "keep apart" are hard rules. Keeping groups together is a preference.

## Development without Docker

```bash
# Backend (needs a PostgreSQL; SQLite also works for quick experiments)
cd backend
uv sync
export DATABASE_URL=postgresql+psycopg://wedding:wedding@localhost:5432/wedding
uv run alembic upgrade head
uv run uvicorn app.main:create_app --factory --reload      # http://localhost:8000/api/docs
uv run python -m app.worker                                # in another terminal

# Frontend
cd frontend
npm install
npm run dev                                                # http://localhost:5173 (proxies /api)
```

When running the frontend dev server, set `PUBLIC_APP_URL=http://localhost:5173` so links in
emails point at it.

### Tests

| Suite | What it covers | Run |
|---|---|---|
| Backend (`backend/tests`, 116 tests) | API, tenant isolation, invitations to join an account, password resets, API keys, the MCP server, abuse limits, venues, seating solver, menus and dish choices, invitations by email and WhatsApp, tracking, RSVP, media, config | `cd backend && uv run pytest` (or `make test`) |
| End-to-end (`e2e/`, Playwright) | Real browser + API + email worker: sign-up and account isolation, joining by invitation, password change and reset, API keys and the MCP server, venues and the calendar address, invitations by WhatsApp, guests and seating rules, menus and dish choices, designing and sending invitations, tracked links, RSVP, replies | `cd e2e && npm ci && npx playwright install chromium && npm test` |
| Frontend types | Strict TypeScript across the SPA | `cd frontend && npm run build` |

```bash
cd backend
uv run pytest                                              # in-memory SQLite, ~20s
TEST_DATABASE_URL=postgresql+psycopg://…/wedding_test uv run pytest   # against PostgreSQL
uv run ruff check . && uv run ruff format --check .
```

The end-to-end suite starts its own API (on a fresh database built by the real migrations)
and the built web app, then reads the emails the worker "sends" from disk to follow the
tracked links.

`deploy/smoke_test.py` checks a running Docker stack through nginx. It signs up, sends an
invitation, confirms the worker delivered it to Mailpit over SMTP, and follows the tracked
link to the RSVP page. Run it after `make up` with `python3 deploy/smoke_test.py`.

GitHub Actions runs all of the above on every push, including building, booting and
smoke-testing the full `docker compose` stack.

### Frontend

`frontend/src` mirrors the backend modules:

- `modules/<feature>/` holds the pages for each feature.
- `api/` is the typed client, which adds the auth and `X-Tenant-ID` headers.
- `auth/` handles the session, login and route guards.
- `components/` is the shared UI kit.

The invitation designer is self-contained in `modules/invitations/designer/`. The rest of the
app uses it only through its `index.tsx`: `CardDesigner`, `CardRenderer` and
`EmailStyleEditor`. The RSVP page renders cards with exactly the same code as the designer.

### Database migrations

```bash
cd backend
uv run alembic revision --autogenerate -m "describe the change"
uv run alembic upgrade head
```

Enum columns are stored as strings, so adding an enum value needs no migration.

## Configuration

All settings are environment variables. See `.env.example` and `backend/app/core/config.py`.

| Variable | Default | Notes |
|---|---|---|
| `ENVIRONMENT` | `development` | `production` refuses to start with a placeholder or short `SECRET_KEY` |
| `SECRET_KEY` | dev value | Signs login tokens. Use `openssl rand -hex 32` |
| `DATABASE_URL` | local Postgres | `postgresql+psycopg://user:pass@host:5432/db` |
| `PUBLIC_APP_URL` | `http://localhost:8080` | Base for RSVP links, tracked links and email images |
| `EMAIL_BACKEND` | `smtp` (compose) | `smtp`, `console`, or `file` (writes JSON files to `EMAIL_FILE_DIR`) |
| `WHATSAPP_BACKEND` | `none` | `waha` (self-hosted bridge, `--profile whatsapp`), `console`, or `file`; `none` hides the channel |
| `WAHA_URL`, `WAHA_API_KEY`, `WAHA_SESSION` | compose defaults | How to reach the bridge and which session sends |
| `PHONE_REGION` | `GB` | Country used to read mobile numbers typed without a country code |
| `EMAIL_FROM`, `SMTP_*` | Mailpit | Host, port, username, password, `SMTP_STARTTLS`, `SMTP_SSL` |
| `MEDIA_ROOT` | `/data/media` | Uploaded images (a Docker volume) |
| `CORS_ORIGINS` | – | Only needed if the SPA is served from a different origin |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `720` | |
| `WORKER_POLL_INTERVAL_SECONDS`, `WORKER_BATCH_SIZE`, `DELIVERY_MAX_ATTEMPTS` | `2`, `50`, `3` | |
| `RATE_LIMIT_AUTH_PER_MINUTE` | `10` | Sign in, sign up and forgotten-password requests per client address. `0` disables |
| `RATE_LIMIT_PUBLIC_PER_MINUTE` | `60` | Guest-facing requests (RSVP, tracked links, calendars, invitation links) per client address |
| `RATE_LIMIT_EMAIL_PER_HOUR` | `30` | Test sends and member invitations per user |
| `INVITE_EXPIRE_DAYS`, `PASSWORD_RESET_EXPIRE_MINUTES` | `7`, `60` | How long invitation and reset links stay valid |
| `WEB_CONCURRENCY` | `2` | API processes |
| `DOMAIN`, `WEB_BIND`, `WEB_PORT` | – | Caddy's domain, and where the web app listens on the host |

## Production checklist

- [ ] Set `ENVIRONMENT=production`, a random `SECRET_KEY`, strong `POSTGRES_PASSWORD`, and
      the real `PUBLIC_APP_URL`.
- [ ] Point `SMTP_*` at a transactional email provider and set up SPF/DKIM for `EMAIL_FROM`.
      Mailpit only runs with `--profile dev`.
- [ ] Serve over HTTPS: `--profile tls` (Caddy) or your own load balancer.
- [ ] Back up the `db-data` and `media` volumes. For several API replicas, move media to
      object storage by implementing `MediaStorage` in `app/modules/media/storage.py`.
- [ ] Mention invitation link-click tracking in your privacy notice to couples and guests.
      Fonts and images are served from your own domain, so there is no third-party request
      to declare.
- [ ] The built-in abuse limits are per API process. For a busy deployment, add a proxy-level
      limit on `/api/v1/auth/*` and `/api/v1/public/*` as well.
- [ ] The web app sends a content security policy (`frontend/security-headers.conf`). If you
      add a script, image or API host, update it.
- [ ] If you turn on WhatsApp through the bridge, use a number you could lose: it works
      against WhatsApp's terms. Keep the bridge's port off the internet (`WAHA_BIND`).

## Not built yet

Ideas that fit the modular structure: email verification at sign-up, billing and
plans per tenant, PostgreSQL row-level security as a second line of defence, households
(one invitation per family), table seat numbers and a printable plan, SMS invitations,
rasterising the card into the email itself, and S3 media storage.
