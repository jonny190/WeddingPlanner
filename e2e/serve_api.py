"""Throwaway API + email worker for the end-to-end tests.

Started by Playwright (see playwright.config.ts). Uses a fresh SQLite database built with
the real Alembic migrations, and the "file" email backend so tests can read sent emails.
"""

import os
import shutil
import sys
import threading
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

import uvicorn  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.db import create_db_engine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.modules.invitations.dispatcher import dispatch_due_deliveries  # noqa: E402
from app.modules.notifications.email import build_email_backend  # noqa: E402


def main() -> None:
    settings = get_settings()
    database = Path(settings.database_url.removeprefix("sqlite:///"))
    database.parent.mkdir(parents=True, exist_ok=True)
    database.unlink(missing_ok=True)
    shutil.rmtree(settings.email_file_dir, ignore_errors=True)

    alembic = Config(str(BACKEND / "alembic.ini"))
    alembic.set_main_option("script_location", str(BACKEND / "alembic"))
    alembic.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(alembic, "head")

    app = create_app(settings, create_db_engine(settings.database_url))
    backend = build_email_backend(settings)
    stop = threading.Event()

    def work() -> None:
        while not stop.is_set():
            if not dispatch_due_deliveries(app.state.session_factory, backend, settings):
                stop.wait(settings.worker_poll_interval_seconds)

    threading.Thread(target=work, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ["E2E_API_PORT"]), log_level="warning")
    stop.set()


if __name__ == "__main__":
    main()
