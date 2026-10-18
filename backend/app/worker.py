"""Background worker: delivers queued invitation emails.

Run with ``python -m app.worker``. Several workers can run at once; each claims
its own batch using row locks.
"""

import logging
import signal
import threading

from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.db import create_db_engine
from app.modules import installed_modules
from app.modules.invitations.dispatcher import dispatch_due_deliveries
from app.modules.notifications.email import build_email_backend
from app.modules.notifications.whatsapp import build_whatsapp_backend

logger = logging.getLogger("app.worker")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    installed_modules()  # register every model before querying
    settings = get_settings()
    session_factory = sessionmaker(create_db_engine(settings.database_url), expire_on_commit=False)
    backend = build_email_backend(settings)
    whatsapp = build_whatsapp_backend(settings)

    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())

    logger.info(
        "Worker started (email backend: %s, whatsapp backend: %s)",
        settings.email_backend,
        settings.whatsapp_backend,
    )
    while not stop.is_set():
        try:
            processed = dispatch_due_deliveries(session_factory, backend, settings, whatsapp)
        except Exception:
            logger.exception("Error while dispatching deliveries")
            processed = 0
        if processed:
            logger.info("Processed %d deliveries", processed)
        else:
            stop.wait(settings.worker_poll_interval_seconds)
    logger.info("Worker stopped")


if __name__ == "__main__":
    main()
