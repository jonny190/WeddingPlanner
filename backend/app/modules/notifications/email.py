"""Outbound email, behind a small interface so transports can be swapped per environment."""

import json
import logging
import smtplib
import time
import uuid
from dataclasses import asdict, dataclass
from email.message import EmailMessage as MimeMessage
from email.utils import make_msgid
from pathlib import Path
from typing import Protocol

from app.core.config import Settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str
    html: str | None = None
    reply_to: str | None = None


class EmailBackend(Protocol):
    def send(self, message: EmailMessage) -> None: ...


class SmtpEmailBackend:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def _mime(self, message: EmailMessage) -> MimeMessage:
        mime = MimeMessage()
        mime["From"] = self.settings.email_from
        mime["To"] = message.to
        mime["Subject"] = message.subject
        mime["Message-ID"] = make_msgid()
        if message.reply_to:
            mime["Reply-To"] = message.reply_to
        mime.set_content(message.text)
        if message.html:
            mime.add_alternative(message.html, subtype="html")
        return mime

    def send(self, message: EmailMessage) -> None:
        s = self.settings
        smtp_cls = smtplib.SMTP_SSL if s.smtp_ssl else smtplib.SMTP
        with smtp_cls(s.smtp_host, s.smtp_port, timeout=s.smtp_timeout_seconds) as smtp:
            if s.smtp_starttls and not s.smtp_ssl:
                smtp.starttls()
            if s.smtp_username:
                smtp.login(s.smtp_username, s.smtp_password or "")
            smtp.send_message(self._mime(message))


class ConsoleEmailBackend:
    """Logs emails instead of sending them; handy for local development."""

    def send(self, message: EmailMessage) -> None:
        logger.info("EMAIL to=%s subject=%r\n%s", message.to, message.subject, message.text)


class FileEmailBackend:
    """Writes each email to a JSON file instead of sending it."""

    def __init__(self, directory: str | Path) -> None:
        self.directory = Path(directory)

    def send(self, message: EmailMessage) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        name = f"{time.time_ns()}-{uuid.uuid4().hex[:8]}.json"
        (self.directory / name).write_text(json.dumps(asdict(message), indent=2))


class MemoryEmailBackend:
    """Keeps sent emails in a list; used by the test suite."""

    def __init__(self) -> None:
        self.outbox: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> None:
        self.outbox.append(message)


def build_email_backend(settings: Settings) -> EmailBackend:
    if settings.email_backend == "smtp":
        return SmtpEmailBackend(settings)
    if settings.email_backend == "file":
        return FileEmailBackend(settings.email_file_dir)
    return ConsoleEmailBackend()
