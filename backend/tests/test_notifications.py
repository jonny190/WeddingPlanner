import json

from app.core.config import Settings
from app.modules.notifications.email import (
    ConsoleEmailBackend,
    EmailMessage,
    FileEmailBackend,
    SmtpEmailBackend,
    build_email_backend,
)


def test_backend_selection(tmp_path):
    assert isinstance(build_email_backend(Settings(email_backend="smtp")), SmtpEmailBackend)
    assert isinstance(build_email_backend(Settings(email_backend="console")), ConsoleEmailBackend)
    backend = build_email_backend(Settings(email_backend="file", email_file_dir=str(tmp_path)))
    assert isinstance(backend, FileEmailBackend)


def test_file_backend_writes_json(tmp_path):
    FileEmailBackend(tmp_path / "out").send(
        EmailMessage(to="jo@example.com", subject="Hi", text="Hello", html="<p>Hello</p>")
    )
    [written] = list((tmp_path / "out").iterdir())
    assert json.loads(written.read_text())["to"] == "jo@example.com"


def test_smtp_message_has_text_and_html_parts():
    backend = SmtpEmailBackend(Settings(email_from="Planner <p@example.com>"))
    mime = backend._mime(
        EmailMessage(
            to="jo@example.com",
            subject="Hi",
            text="Hello",
            html="<p>Hello</p>",
            reply_to="couple@example.com",
        )
    )
    assert mime["Reply-To"] == "couple@example.com"
    assert [part.get_content_type() for part in mime.iter_parts()] == ["text/plain", "text/html"]
