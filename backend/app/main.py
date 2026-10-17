from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings, get_settings
from app.core.db import create_db_engine
from app.core.errors import register_error_handlers
from app.core.modules import validate_modules
from app.core.ratelimit import RateLimiter
from app.modules import installed_modules
from app.modules.media.storage import LocalMediaStorage, MediaStorage
from app.modules.notifications.email import EmailBackend, build_email_backend
from app.modules.tenancy.deps import DB


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Run whatever the installed modules need alive for as long as the app is."""
    async with AsyncExitStack() as stack:
        for module_lifespan in app.state.module_lifespans:
            await stack.enter_async_context(module_lifespan)
        yield


def create_app(
    settings: Settings | None = None,
    engine: Engine | None = None,
    media_storage: MediaStorage | None = None,
    email_backend: EmailBackend | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    engine = engine or create_db_engine(settings.database_url)

    app = FastAPI(
        title=f"{settings.app_name} API",
        version="0.1.0",
        openapi_url="/api/openapi.json",
        docs_url="/api/docs",
        redoc_url=None,
        lifespan=_lifespan,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = sessionmaker(engine, expire_on_commit=False)
    app.state.media_storage = media_storage or LocalMediaStorage(settings.media_root)
    # Transactional mail the API sends straight away (member invitations, password resets).
    # Invitations to guests go through the outbox and the worker instead.
    app.state.email_backend = email_backend or build_email_backend(settings)
    app.state.rate_limiter = RateLimiter()
    app.state.module_lifespans = []

    register_error_handlers(app)
    if settings.cors_origin_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    modules = installed_modules()
    validate_modules(modules)
    for module in modules:
        if module.router is not None:
            app.include_router(module.router, prefix="/api/v1")
        if module.public_router is not None:
            app.include_router(module.public_router, prefix="/api/v1/public")
    for module in modules:
        if module.install is not None:
            lifespan = module.install(app)
            if lifespan is not None:
                app.state.module_lifespans.append(lifespan)

    @app.get("/api/health", tags=["Health"])
    def health(db: DB):
        db.execute(text("SELECT 1"))
        return {"status": "ok", "modules": [m.name for m in modules]}

    return app
