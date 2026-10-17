"""API keys: how software (an agent such as Hermes, or a script) acts within one account.

A key belongs to one member of one account and can never do more than that member could.
It is created from a signed-in session, shown once, and only its hash is stored.
"""

import hashlib
import secrets
import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import bind_tenant, utcnow
from app.core.errors import BadRequest, Forbidden, NotFound, Unauthorized
from app.modules.tenancy.context import TenantContext
from app.modules.tenancy.models import ApiKey, Membership, Role
from app.modules.tenancy.schemas import ApiKeyCreate, ApiKeyCreated, ApiKeyRead

API_KEY_PREFIX = "wp_"
# How much of the key is kept in the clear, to tell keys apart in a list: "wp_" + 8 characters.
PREFIX_LENGTH = len(API_KEY_PREFIX) + 8
# last_used_at is refreshed at most this often, so a busy agent does not write on every call.
LAST_USED_REFRESH = timedelta(minutes=5)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _read(key: ApiKey) -> ApiKeyRead:
    return ApiKeyRead(
        id=key.id,
        name=key.name,
        prefix=key.prefix,
        can_write=key.can_write,
        can_send=key.can_send,
        user_id=key.user_id,
        user_name=key.user.full_name,
        created_at=key.created_at,
        expires_at=key.expires_at,
        last_used_at=key.last_used_at,
    )


def list_api_keys(db: Session, ctx: TenantContext) -> list[ApiKeyRead]:
    """Your own keys; admins and owners see every key in the account."""
    query = select(ApiKey).order_by(ApiKey.created_at)
    if not ctx.has_role(Role.admin):
        query = query.where(ApiKey.user_id == ctx.user_id)
    return [_read(k) for k in db.scalars(query)]


def create_api_key(db: Session, ctx: TenantContext, data: ApiKeyCreate) -> ApiKeyCreated:
    if ctx.via_api_key:
        raise Forbidden("API keys can only be created from a signed-in session")
    if data.can_write and not ctx.has_role(Role.editor):
        raise Forbidden("Your role does not allow changes, so a key cannot either")
    if data.can_send and not data.can_write:
        raise BadRequest("A key that sends email must also be allowed to make changes")
    token = API_KEY_PREFIX + secrets.token_urlsafe(32)
    key = ApiKey(
        user_id=ctx.user_id,
        name=data.name.strip(),
        prefix=token[:PREFIX_LENGTH],
        token_hash=_hash(token),
        can_write=data.can_write,
        can_send=data.can_send,
        expires_at=(
            utcnow() + timedelta(days=data.expires_in_days) if data.expires_in_days else None
        ),
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    return ApiKeyCreated(key=token, **_read(key).model_dump())


def revoke_api_key(db: Session, ctx: TenantContext, key_id: uuid.UUID) -> None:
    """Delete a key. Members can revoke their own; admins and owners can revoke any."""
    if ctx.via_api_key:
        raise Forbidden("API keys can only be revoked from a signed-in session")
    key = db.get(ApiKey, key_id)
    if key is None or (key.user_id != ctx.user_id and not ctx.has_role(Role.admin)):
        raise NotFound("API key not found")
    db.delete(key)
    db.commit()


def resolve_api_key(db: Session, token: str) -> ApiKey:
    """The key a bearer token stands for, if it is valid. Called before any tenant is bound."""
    key = db.scalar(select(ApiKey).where(ApiKey.token_hash == _hash(token)))
    now = utcnow()
    if (
        key is None
        or (key.expires_at is not None and key.expires_at <= now)
        or not key.user.is_active
    ):
        raise Unauthorized("This API key is not valid", code="invalid_api_key")
    if key.last_used_at is None or now - key.last_used_at > LAST_USED_REFRESH:
        key.last_used_at = now
        db.commit()
    return key


def context_for(db: Session, key: ApiKey) -> TenantContext:
    """Bind the session to the key's account and describe what the key may do there.

    Shared by the REST dependencies and the MCP server, so a key behaves the same whichever
    door it comes through: its owner's role, capped to viewer unless it may write.
    """
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == key.user_id, Membership.tenant_id == key.tenant_id
        )
    )
    if membership is None:
        raise Forbidden(
            "The owner of this API key is no longer a member of the account", code="not_a_member"
        )
    bind_tenant(db, key.tenant_id)
    return TenantContext(
        tenant_id=key.tenant_id,
        user_id=key.user_id,
        role=membership.role if key.can_write else Role.viewer,
        api_key_id=key.id,
        can_send=key.can_send,
    )
