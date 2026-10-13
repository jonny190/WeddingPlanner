import hashlib
import uuid
from datetime import timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import Settings
from app.core.db import utcnow

_hasher = PasswordHasher()
_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def create_access_token(user_id: uuid.UUID, settings: Settings) -> str:
    now = utcnow()
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
        "typ": "access",
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def password_fingerprint(password_hash: str) -> str:
    """A short, non-reversible stand-in for the current password hash.

    Baked into reset tokens so a link stops working as soon as the password changes.
    """
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def create_password_reset_token(user_id: uuid.UUID, password_hash: str, settings: Settings) -> str:
    now = utcnow()
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.password_reset_expire_minutes),
        "typ": "reset",
        "pwd": password_fingerprint(password_hash),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def decode_password_reset_token(token: str, settings: Settings) -> tuple[uuid.UUID, str] | None:
    """The user id and password fingerprint a reset token was issued for, if it is valid."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
        if payload.get("typ") != "reset":
            return None
        return uuid.UUID(payload["sub"]), str(payload["pwd"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def decode_access_token(token: str, settings: Settings) -> uuid.UUID | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
        if payload.get("typ") != "access":
            return None
        return uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
