"""FastAPI dependencies other modules use to authenticate and scope requests."""

import uuid
from typing import Annotated

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.db import bind_tenant, get_db
from app.core.errors import BadRequest, Forbidden, Unauthorized
from app.core.security import decode_access_token
from app.modules.tenancy.context import TenantContext
from app.modules.tenancy.models import Membership, Role, User

_bearer = HTTPBearer(auto_error=False)

DB = Annotated[Session, Depends(get_db)]


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


AppSettings = Annotated[Settings, Depends(get_app_settings)]


def get_current_user(
    db: DB,
    settings: AppSettings,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise Unauthorized()
    user_id = decode_access_token(credentials.credentials, settings)
    user = db.get(User, user_id) if user_id else None
    if user is None or not user.is_active:
        raise Unauthorized("Your session has expired, please sign in again")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_tenant_context(
    db: DB,
    user: CurrentUser,
    tenant_id: Annotated[uuid.UUID | None, Header(alias="X-Tenant-ID")] = None,
) -> TenantContext:
    if tenant_id is None:
        raise BadRequest("The X-Tenant-ID header is required", code="tenant_required")
    membership = db.scalar(
        select(Membership).where(Membership.user_id == user.id, Membership.tenant_id == tenant_id)
    )
    if membership is None:
        raise Forbidden("You are not a member of this account")
    # From here on every query on this session is restricted to the tenant.
    bind_tenant(db, tenant_id)
    return TenantContext(tenant_id=tenant_id, user_id=user.id, role=membership.role)


def _require(minimum: Role):
    def checker(ctx: Annotated[TenantContext, Depends(get_tenant_context)]) -> TenantContext:
        if not ctx.has_role(minimum):
            raise Forbidden(f"This action needs the '{minimum.value}' role or higher")
        return ctx

    return checker


CurrentTenant = Annotated[TenantContext, Depends(get_tenant_context)]
EditorTenant = Annotated[TenantContext, Depends(_require(Role.editor))]
AdminTenant = Annotated[TenantContext, Depends(_require(Role.admin))]
