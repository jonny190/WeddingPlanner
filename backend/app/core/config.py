from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET = "dev-insecure-secret-change-me-before-deploying"
PLACEHOLDER_SECRETS = {DEFAULT_SECRET, "change-me-to-a-long-random-string"}


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (or a local .env file)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Wedding Planner"
    environment: Literal["development", "test", "production"] = "development"

    database_url: str = "postgresql+psycopg://wedding:wedding@localhost:5432/wedding"

    secret_key: str = DEFAULT_SECRET
    access_token_expire_minutes: int = 60 * 12

    # Comma separated list of origins allowed to call the API from a browser.
    cors_origins: str = ""

    # Base URL of the web app; used to build RSVP links in invitation emails.
    public_app_url: str = "http://localhost:8080"

    email_backend: Literal["smtp", "console", "file"] = "console"
    # Where the "file" backend writes emails (one JSON file each); handy for tests and demos.
    email_file_dir: str = "./sent-emails"
    email_from: str = "Wedding Planner <invitations@example.com>"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = False
    smtp_ssl: bool = False
    smtp_timeout_seconds: float = 15.0

    # Uploaded images (invitation artwork). Mount a volume here in Docker.
    media_root: str = "./media"
    max_upload_bytes: int = 8 * 1024 * 1024

    worker_poll_interval_seconds: float = 2.0
    worker_batch_size: int = 50
    delivery_max_attempts: int = 3

    # WhatsApp invitations go through a bridge: "waha" (self-hosted WAHA), "console", "file"
    # (JSON files, used by the end-to-end tests) or "none", which hides the channel entirely.
    whatsapp_backend: Literal["none", "waha", "console", "file"] = "none"
    whatsapp_file_dir: str = "./sent-whatsapp"
    waha_url: str = "http://waha:3000"
    waha_api_key: str | None = None
    waha_session: str = "default"
    # How to read a mobile number typed without a country code (ISO 3166 country code).
    phone_region: str = "GB"

    # Abuse limits, counted per client IP (or per user where noted) in each API process.
    # Set a limit to 0 to switch that bucket off.
    rate_limit_auth_per_minute: int = 10  # sign in, sign up, forgotten password
    rate_limit_public_per_minute: int = 60  # guest RSVP pages, tracked links, calendars
    rate_limit_email_per_hour: int = 30  # per user: test sends and member invitations

    # How long a member invitation link and a password reset link stay valid.
    invite_expire_days: int = 7
    password_reset_expire_minutes: int = 60

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @model_validator(mode="after")
    def _require_real_secret_in_production(self) -> "Settings":
        if self.environment == "production" and (
            self.secret_key in PLACEHOLDER_SECRETS or len(self.secret_key) < 32
        ):
            raise ValueError("Set SECRET_KEY to a random value of 32+ characters in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
