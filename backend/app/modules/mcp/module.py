from contextlib import AbstractAsyncContextManager

from fastapi import FastAPI

from app.core.modules import Module
from app.modules.mcp.server import MCP_PATH, build_endpoint, build_server


def install(app: FastAPI) -> AbstractAsyncContextManager[None]:
    server = build_server(app.state.session_factory, app.state.settings)
    app.add_route(
        MCP_PATH, build_endpoint(server, app.state.session_factory), include_in_schema=False
    )
    app.state.mcp_server = server
    return server.session_manager.run()


module = Module(
    name="mcp",
    description="MCP server at /api/mcp: the planner as tools for agents, authenticated by API key",
    install=install,
    depends_on=("tenancy", "weddings", "guests", "seating", "menus", "invitations", "rsvp"),
)
