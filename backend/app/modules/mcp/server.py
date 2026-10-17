"""The planner's capabilities as MCP tools, for an agent such as Hermes.

The server is mounted at ``/api/mcp`` on the API and speaks Streamable HTTP in its stateless,
JSON-reply form: every request stands alone and carries an API key in the ``Authorization``
header. Nothing is remembered between calls, so several API processes behind nginx need no
shared state, and tenancy is decided afresh on every tool call from the key that made it.

Tools call the same service functions the REST API does, on a database session bound to the
key's account (see ``tenancy/api_keys.py``), so a key sees and changes exactly what its owner
could through the web app, and never more.
"""

import logging
from collections.abc import Iterator, Mapping
from contextlib import contextmanager

from mcp.server.mcpserver import Context, MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.streamable_http_manager import StreamableHTTPASGIApp
from mcp.server.transport_security import TransportSecuritySettings
from sqlalchemy.orm import Session, sessionmaker
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import Settings
from app.core.errors import AppError
from app.modules.tenancy.api_keys import API_KEY_PREFIX, context_for, resolve_api_key
from app.modules.tenancy.context import TenantContext
from app.modules.tenancy.models import Role

MCP_PATH = "/api/mcp"

INSTRUCTIONS = """\
You are working inside one Wedding Planner account, chosen by the API key you were given.
Start with list_weddings to learn the wedding and event ids; most tools need them. A wedding
has events (a "day" and an "evening" are typical) and guests are invited to each event
separately, with their own plus-one allowance per event.

Reading never changes anything. Tools that change data say so in their description and need
a key that may make changes. send_invitations is a dry run unless dry_run is false, and
sending for real needs a key that may send email. Prefer a dry run first and tell the person
who will receive what before sending. Ask before deleting guests or sending email.
"""


def bearer_token(headers: Mapping[str, str] | None) -> str | None:
    value = (headers or {}).get("authorization") or (headers or {}).get("Authorization") or ""
    scheme, _, token = value.partition(" ")
    if scheme.lower() != "bearer" or not token.strip().startswith(API_KEY_PREFIX):
        return None
    return token.strip()


class ApiKeyGate:
    """ASGI middleware that turns away requests without a valid API key.

    The MCP server behind it then re-reads the key on each tool call to bind the account;
    this gate just makes sure anonymous callers never reach the tool list.
    """

    def __init__(self, app: ASGIApp, session_factory: sessionmaker) -> None:
        self.app = app
        self.session_factory = session_factory

    def _check(self, token: str) -> None:
        with self.session_factory() as db:
            context_for(db, resolve_api_key(db, token))

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        token = bearer_token(Headers(scope=scope))
        problem = "Send an API key as 'Authorization: Bearer wp_...'" if token is None else None
        if token is not None:
            try:
                await run_in_threadpool(self._check, token)
            except AppError as exc:
                problem = exc.message
        if problem is not None:
            response = JSONResponse(
                {"detail": problem, "code": "unauthorized"},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


class Accounts:
    """Opens a database session bound to the calling key's account, for one tool call."""

    def __init__(self, session_factory: sessionmaker, settings: Settings) -> None:
        self.session_factory = session_factory
        self.settings = settings

    @contextmanager
    def open(
        self, ctx: Context, minimum: Role = Role.viewer
    ) -> Iterator[tuple[Session, TenantContext]]:
        token = bearer_token(ctx.headers)
        if token is None:
            raise ToolError("No API key was sent with this request")
        db = self.session_factory()
        try:
            try:
                key = resolve_api_key(db, token)
                tenant = context_for(db, key)
            except AppError as exc:
                raise ToolError(exc.message) from exc
            if not tenant.has_role(minimum):
                if not key.can_write:
                    raise ToolError(
                        "This API key is read-only, so it cannot make changes. "
                        "Ask for a key that may make changes."
                    )
                raise ToolError(
                    f"This needs the {minimum.value} role; "
                    f"the key's owner is a {tenant.role.value}."
                )
            try:
                yield db, tenant
            except AppError as exc:
                raise ToolError(exc.message) from exc
        finally:
            db.close()


def build_server(session_factory: sessionmaker, settings: Settings) -> MCPServer:
    from app.modules.mcp.tools import register

    # The SDK configures the root logger when a server is built (basicConfig with a Rich
    # handler at INFO), which would make every API process echo each SQL and HTTP line.
    # Keep the application's logging as it was, and drop the SDK's per-request chatter.
    root = logging.getLogger()
    handlers, level = list(root.handlers), root.level
    try:
        server = MCPServer(
            "Wedding Planner",
            instructions=INSTRUCTIONS,
            version="0.1.0",
            website_url=settings.public_app_url,
        )
    finally:
        root.handlers[:] = handlers
        root.setLevel(level)
    logging.getLogger("mcp").setLevel(logging.WARNING)
    register(server, Accounts(session_factory, settings))
    return server


def build_endpoint(server: MCPServer, session_factory: sessionmaker) -> ASGIApp:
    """The ASGI app to mount at MCP_PATH. ``server.session_manager.run()`` must be entered
    for the application's lifetime first (the module's install hook returns it)."""
    # The Starlette app this returns is not used (it would need its own lifespan and route
    # prefix); it is called for its side effect of creating the session manager.
    server.streamable_http_app(
        streamable_http_path="/",
        json_response=True,
        stateless_http=True,
        host="0.0.0.0",
        # DNS rebinding protection guards servers that trust the caller by origin. Here every
        # request must carry a bearer key, which a rebinding attacker's page cannot supply.
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
    return ApiKeyGate(StreamableHTTPASGIApp(server.session_manager), session_factory)
