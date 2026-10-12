from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings, get_settings
from app.core.db import create_db_engine
from app.core.errors import register_error_handlers
from app.core.modules import validate_modules
from app.modules import installed_modules
from app.modules.media.storage import LocalMediaStorage, MediaStorage
from app.modules.tenancy.deps import DB


def create_app(
    settings: Settings | None = None,
    engine: Engine | None = None,
    media_storage: MediaStorage | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    engine = engine or create_db_engine(settings.database_url)

    app = FastAPI(
        title=f"{settings.app_name} API",
        version="0.1.0",
        openapi_url="/api/openapi.json",
        docs_url="/api/docs",
        redoc_url=None,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = sessionmaker(engine, expire_on_commit=False)
    app.state.media_storage = media_storage or LocalMediaStorage(settings.media_root)

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

    @app.get("/api/health", tags=["Health"])
    def health(db: DB):
        db.execute(text("SELECT 1"))
        return {"status": "ok", "modules": [m.name for m in modules]}

    return app
