import pytest
from pydantic import ValidationError

from app.core.config import Settings


@pytest.mark.parametrize(
    "secret",
    [
        "dev-insecure-secret-change-me-before-deploying",
        "change-me-to-a-long-random-string",
        "too-short",
    ],
)
def test_production_rejects_weak_secrets(secret):
    with pytest.raises(ValidationError):
        Settings(environment="production", secret_key=secret)


def test_production_accepts_a_real_secret():
    settings = Settings(
        environment="production",
        secret_key="x" * 64,
        cors_origins="https://a.example, https://b.example",
    )
    assert settings.cors_origin_list == ["https://a.example", "https://b.example"]
