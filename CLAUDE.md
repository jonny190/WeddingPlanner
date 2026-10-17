# Wedding Planner

Multi-tenant wedding planning SaaS: guest lists, seating, designed invitations sent by email,
RSVP tracking. Python/FastAPI backend, React/TypeScript frontend, PostgreSQL, Docker Compose.
Read `README.md` first: it explains the architecture, the module layout and every setting.

## Layout

- `backend/app/core/` is the platform: config, db (tenant scoping), security, errors, rate limiter, module registry.
- `backend/app/modules/<name>/` is one feature each, with `models.py`, `schemas.py`, `service.py`, `router.py`, `module.py`. Installed in dependency order in `backend/app/modules/__init__.py`.
- `frontend/src/modules/<feature>/` mirrors the backend. Shared UI lives in `frontend/src/components/`, the typed API client in `frontend/src/api/`, auth and session in `frontend/src/auth/`.
- `frontend/src/modules/invitations/designer/` is the card designer. The rest of the app uses it only through its `index.tsx`.
- `e2e/` holds Playwright tests that drive the real app, API and email worker.
- `docs/` holds design notes, `guides/` holds user guides. Keep both current when behaviour changes.

## Working rules

- Change the module that owns a behaviour before touching anything in `core/`.
- Tenant-owned tables inherit `TenantScoped`. Never add `tenant_id` filters by hand; the session hook in `core/db.py` does it. Public endpoints resolve a token, then call `bind_tenant`.
- Every design, upload and email value is validated or escaped on the backend. Keep it that way.
- New settings go in `core/config.py`, `.env.example` and the README table.
- Schema changes: edit the models, then `cd backend && uv run alembic revision --autogenerate -m "..."`. CI runs `alembic check` against PostgreSQL, so the migration must match the models exactly. Write migrations in the style of the existing ones (plain `sa.DateTime(timezone=True)`, no batch mode).
- Fonts are bundled, not fetched. `FONT_CATALOG` in `backend/app/modules/invitations/design.py` and `frontend/src/modules/invitations/designer/webfonts.ts` must list the same families and weights.
- The web app sends a strict content security policy from `frontend/security-headers.conf`. Anything loaded from another origin needs adding there.
- No em dashes in prose or UI copy. Write documentation like a person would.
- Git: branch per change, open a pull request, no AI attribution lines in commits or PRs.

## Checks before handing over

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest
cd frontend && npm run build
cd e2e && npm test                      # needs: npx playwright install chromium
make up && python3 deploy/smoke_test.py # the Docker stack, through nginx
```

## Where things are

| Need | Look in |
|---|---|
| Sign in, sign up, invitations to join an account, password change and reset | `backend/app/modules/tenancy/`, `frontend/src/auth/`, `frontend/src/modules/account/` |
| Abuse limits | `backend/app/core/ratelimit.py`, applied in the routers |
| Email sending | `backend/app/modules/notifications/email.py`; guest invitations queue in `invitation_deliveries` and `backend/app/worker.py` sends them |
| Card format and rendering | `backend/app/modules/invitations/design.py`, `rendering.py`, `frontend/.../designer/CardSurface.tsx` |
| Seating solver | `backend/app/modules/seating/solver.py` (pure, unit tested) |
| Menus and dish choices | `backend/app/modules/menus/`, `frontend/src/modules/menus/`; the guest picks in `frontend/src/modules/rsvp/RsvpForm.tsx` |
| Guest-facing pages | `frontend/src/modules/rsvp/` (see `docs/guest-invitation.md`) |
| API keys, and the MCP server that offers the planner as tools to agents | `backend/app/modules/tenancy/api_keys.py`, `backend/app/modules/mcp/`, `frontend/src/modules/account/ApiKeysCard.tsx` (see `docs/mcp.md`) |
| The envelope reveal and its settings | `frontend/src/components/envelope/`, `EnvelopeStyle` in `backend/app/modules/invitations/design.py`, Envelope tab in `frontend/src/modules/invitations/DraftEditor.tsx` |

## History

Built 12 October 2026. On 13 October 2026 the member flow changed from "admin sets a password"
to email invitations, password change and reset were added, abuse limits were added to the
public and auth routes, the worker got a heartbeat so slow batches are not re-sent, fonts moved
in-house, and nginx gained a content security policy. See `docs/security.md`. On 17 October
2026 API keys and the MCP server at `/api/mcp` were added so agents such as Hermes can work in
an account; see `docs/mcp.md`.
