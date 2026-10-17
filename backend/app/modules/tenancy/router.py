import uuid

from fastapi import APIRouter, Request, status

from app.core.errors import NotFound
from app.core.ratelimit import AuthAttempt, PublicRequest, check_per_user
from app.modules.tenancy import api_keys, service
from app.modules.tenancy.deps import (
    DB,
    AdminTenant,
    AppSettings,
    CurrentTenant,
    CurrentUser,
    Mailer,
    OptionalUser,
)
from app.modules.tenancy.models import Tenant
from app.modules.tenancy.schemas import (
    ApiKeyCreate,
    ApiKeyCreated,
    ApiKeyRead,
    ForgotPasswordRequest,
    InviteAccept,
    InviteCreate,
    InvitePublic,
    InviteRead,
    LoginRequest,
    MemberRead,
    MemberUpdate,
    MeResponse,
    PasswordChange,
    PasswordResetRequest,
    SessionResponse,
    SignupRequest,
    TenantCreate,
    TenantRead,
    TenantUpdate,
    UserRead,
)

router = APIRouter(tags=["Accounts"])
public_router = APIRouter(prefix="/invites", tags=["Account invitations"])


# --- Authentication ---------------------------------------------------------------------


@router.post(
    "/auth/signup",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[AuthAttempt],
)
def signup(data: SignupRequest, db: DB, settings: AppSettings):
    user = service.signup(db, data)
    return service.session_response(db, user, settings)


@router.post("/auth/login", response_model=SessionResponse, dependencies=[AuthAttempt])
def login(data: LoginRequest, db: DB, settings: AppSettings):
    user = service.authenticate(db, data.email, data.password)
    return service.session_response(db, user, settings)


@router.get("/auth/me", response_model=MeResponse)
def me(user: CurrentUser, db: DB):
    return MeResponse(user=UserRead.model_validate(user), tenants=service.tenants_for(db, user))


@router.post("/auth/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(data: PasswordChange, user: CurrentUser, db: DB):
    """Change your own password; the current one is needed to prove it is you."""
    service.change_password(db, user, data.current_password, data.new_password)


@router.post(
    "/auth/forgot-password",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[AuthAttempt],
)
def forgot_password(data: ForgotPasswordRequest, db: DB, settings: AppSettings, mailer: Mailer):
    """Email a reset link. Always answers 202, whether or not the address is known."""
    service.request_password_reset(db, data.email, settings, mailer)
    return {"detail": "If that address has a login, a reset link is on its way"}


@router.post("/auth/reset-password", response_model=SessionResponse, dependencies=[AuthAttempt])
def reset_password(data: PasswordResetRequest, db: DB, settings: AppSettings):
    """Set a new password with the token from the reset email, and sign in."""
    return service.reset_password(db, data.token, data.new_password, settings)


# --- Accounts ---------------------------------------------------------------------------


@router.post("/tenants", response_model=TenantRead, status_code=status.HTTP_201_CREATED)
def create_tenant(data: TenantCreate, user: CurrentUser, db: DB):
    tenant = service.create_tenant(db, data.name, user)
    db.commit()
    return TenantRead(id=tenant.id, name=tenant.name, slug=tenant.slug, role="owner")


def _current_tenant(db: DB, ctx: CurrentTenant) -> TenantRead:
    tenant = db.get(Tenant, ctx.tenant_id)
    if tenant is None:
        raise NotFound("Account not found")
    return TenantRead(id=tenant.id, name=tenant.name, slug=tenant.slug, role=ctx.role)


@router.get("/tenants/current", response_model=TenantRead)
def get_current_tenant(db: DB, ctx: CurrentTenant):
    return _current_tenant(db, ctx)


@router.patch("/tenants/current", response_model=TenantRead)
def update_current_tenant(data: TenantUpdate, db: DB, ctx: AdminTenant):
    tenant = db.get(Tenant, ctx.tenant_id)
    if tenant is None:
        raise NotFound("Account not found")
    tenant.name = data.name
    db.commit()
    return _current_tenant(db, ctx)


# --- Members ----------------------------------------------------------------------------


@router.get("/tenants/current/members", response_model=list[MemberRead])
def list_members(db: DB, ctx: CurrentTenant):
    return service.list_members(db, ctx)


@router.patch("/tenants/current/members/{membership_id}", response_model=MemberRead)
def update_member(membership_id: uuid.UUID, data: MemberUpdate, db: DB, ctx: AdminTenant):
    return service.update_member_role(db, ctx, membership_id, data.role)


@router.delete("/tenants/current/members/{membership_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(membership_id: uuid.UUID, db: DB, ctx: AdminTenant):
    service.remove_member(db, ctx, membership_id)


@router.get("/tenants/current/invites", response_model=list[InviteRead])
def list_invites(db: DB, _ctx: AdminTenant):
    """Invitations that have been sent but not yet accepted."""
    return service.list_invites(db)


@router.post(
    "/tenants/current/invites", response_model=InviteRead, status_code=status.HTTP_201_CREATED
)
def invite_member(
    data: InviteCreate,
    request: Request,
    db: DB,
    ctx: AdminTenant,
    settings: AppSettings,
    mailer: Mailer,
):
    """Email someone an invitation to join this account with the given role."""
    check_per_user(request, "email", ctx.user_id, "rate_limit_email_per_hour", 3600)
    return service.invite_member(db, ctx, data, settings, mailer)


@router.delete("/tenants/current/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite(invite_id: uuid.UUID, db: DB, _ctx: AdminTenant):
    service.revoke_invite(db, invite_id)


# --- Accepting an invitation (public: the link is the credential) ------------------------


@public_router.get("/{token}", response_model=InvitePublic, dependencies=[PublicRequest])
def invite_details(token: str, db: DB):
    return service.invite_details(db, token)


@public_router.post("/{token}/accept", response_model=SessionResponse, dependencies=[PublicRequest])
def accept_invite(
    token: str, data: InviteAccept, db: DB, user: OptionalUser, settings: AppSettings
):
    """Join the account. Signed-in users accept as themselves; others create a login first."""
    return service.accept_invite(db, token, data, user, settings)


# --- API keys: how agents and scripts act within the account -------------------------------


@router.get("/tenants/current/api-keys", response_model=list[ApiKeyRead])
def list_api_keys(db: DB, ctx: CurrentTenant):
    """Your own keys; admins and owners see every key in the account."""
    return api_keys.list_api_keys(db, ctx)


@router.post(
    "/tenants/current/api-keys",
    response_model=ApiKeyCreated,
    status_code=status.HTTP_201_CREATED,
)
def create_api_key(data: ApiKeyCreate, db: DB, ctx: CurrentTenant):
    """Make a key for yourself. The secret is in this reply only; it is not shown again."""
    return api_keys.create_api_key(db, ctx, data)


@router.delete("/tenants/current/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_api_key(key_id: uuid.UUID, db: DB, ctx: CurrentTenant):
    api_keys.revoke_api_key(db, ctx, key_id)
