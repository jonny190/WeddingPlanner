"""WhatsApp delivery, behind a small interface like email.

The first backend talks to WAHA (WhatsApp HTTP API), a self-hosted bridge that drives an
ordinary WhatsApp account over the web protocol. That is unofficial: WhatsApp's terms do not
allow it and numbers can be banned, so it suits a single wedding run by its own couple rather
than a service sending on behalf of many customers. An official gateway (Meta's Cloud API,
Twilio) would be another class behind the same interface.
"""

import json
import logging
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Protocol

import httpx2

from app.core.config import Settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class WhatsAppMessage:
    # International format with the leading plus, e.g. +447700900123.
    to: str
    text: str


@dataclass(frozen=True)
class WhatsAppStatus:
    connected: bool
    detail: str
    # The number the bridge is signed in as, when it can tell us.
    number: str | None = None


class WhatsAppError(RuntimeError):
    pass


class WhatsAppBackend(Protocol):
    name: str

    def send(self, message: WhatsAppMessage) -> None: ...

    def status(self) -> WhatsAppStatus: ...


_SESSION_STATES = {
    "SCAN_QR_CODE": "Waiting for a phone to be paired: scan the QR code in the bridge's dashboard",
    "STARTING": "The WhatsApp session is starting",
    "STOPPED": "The WhatsApp session is stopped; start it from the bridge's dashboard",
    "FAILED": "The WhatsApp session failed; restart it from the bridge's dashboard",
}


class WahaBackend:
    """Sends through WAHA's REST API: POST /api/sendText with the number as a chat id."""

    name = "waha"

    def __init__(self, settings: Settings, client: httpx2.Client | None = None) -> None:
        self.session = settings.waha_session
        headers = {"X-Api-Key": settings.waha_api_key} if settings.waha_api_key else {}
        self.client = client or httpx2.Client(
            base_url=settings.waha_url.rstrip("/"), headers=headers, timeout=20.0
        )

    @staticmethod
    def chat_id(to: str) -> str:
        return f"{to.lstrip('+')}@c.us"

    def send(self, message: WhatsAppMessage) -> None:
        response = self.client.post(
            "/api/sendText",
            json={
                "session": self.session,
                "chatId": self.chat_id(message.to),
                "text": message.text,
                "linkPreview": True,
            },
        )
        if response.status_code >= 400:
            raise WhatsAppError(f"WAHA answered {response.status_code}: {response.text[:200]}")

    def status(self) -> WhatsAppStatus:
        try:
            response = self.client.get(f"/api/sessions/{self.session}", timeout=5.0)
        except Exception as exc:  # noqa: BLE001 - any transport problem reads as "unreachable"
            return WhatsAppStatus(
                False, f"The WhatsApp bridge is unreachable ({type(exc).__name__})"
            )
        if response.status_code == 404:
            return WhatsAppStatus(
                False, "No WhatsApp session yet: open the bridge's dashboard and pair a phone"
            )
        if response.status_code >= 400:
            return WhatsAppStatus(False, f"The WhatsApp bridge answered {response.status_code}")
        data = response.json()
        state = str(data.get("status", "")).upper()
        me = data.get("me") or {}
        raw = str(me.get("id") or "")
        number = f"+{raw.split('@')[0]}" if raw and raw.split("@")[0].isdigit() else None
        if state == "WORKING":
            return WhatsAppStatus(True, "Connected", number)
        return WhatsAppStatus(False, _SESSION_STATES.get(state, f"WhatsApp session is {state}"))


class ConsoleWhatsAppBackend:
    """Logs messages instead of sending them; handy for local development."""

    name = "console"

    def send(self, message: WhatsAppMessage) -> None:
        logger.info("WHATSAPP to=%s\n%s", message.to, message.text)

    def status(self) -> WhatsAppStatus:
        return WhatsAppStatus(True, "Messages are written to the server log, not sent")


class FileWhatsAppBackend:
    """Writes each message to a JSON file instead of sending it (the end-to-end tests)."""

    name = "file"

    def __init__(self, directory: str | Path) -> None:
        self.directory = Path(directory)

    def send(self, message: WhatsAppMessage) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        name = f"{time.time_ns()}-{uuid.uuid4().hex[:8]}.json"
        (self.directory / name).write_text(json.dumps(asdict(message), indent=2))

    def status(self) -> WhatsAppStatus:
        return WhatsAppStatus(True, f"Messages are written to {self.directory}, not sent")


class MemoryWhatsAppBackend:
    """Keeps sent messages in a list; used by the test suite."""

    name = "memory"

    def __init__(self) -> None:
        self.outbox: list[WhatsAppMessage] = []

    def send(self, message: WhatsAppMessage) -> None:
        self.outbox.append(message)

    def status(self) -> WhatsAppStatus:
        return WhatsAppStatus(True, "Connected", "+447700900000")


def build_whatsapp_backend(settings: Settings) -> WhatsAppBackend | None:
    """None when the channel is switched off, which hides it from the web app and the API."""
    if settings.whatsapp_backend == "waha":
        return WahaBackend(settings)
    if settings.whatsapp_backend == "console":
        return ConsoleWhatsAppBackend()
    if settings.whatsapp_backend == "file":
        return FileWhatsAppBackend(settings.whatsapp_file_dir)
    return None
