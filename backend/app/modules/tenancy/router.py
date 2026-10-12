import uuid

from fastapi import APIRouter, status

from app.core.errors import NotFound
from app.modules.tenancy import service
from app.modules.tenancy.deps import DB, AdminTenant, AppSettings, CurrentTenant, CurrentUser
from app.modules.tenancy.models import Tenant
from app.modules.tenancy.schemas import (
    LoginRequest,
    MemberCreate,
    MemberRead,
    MemberUpdate,
    MeResponse,
    SessionResponse,
    SignupRequest,
    TenantCreate,
    TenantRead,
    TenantUpdate,
    UserRead,
)

router = APIRouter(tags=["Accounts"])


@router.post("/auth/signup", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def signup(data: SignupRequest, db: DB, settings: AppSettings):
    user = service.signup(db, data)
    return service.session_response(db, user, settings)


@router.post("/auth/login", response_model=SessionResponse)
def login(data: LoginRequest, db: DB, settings: AppSettings):
    user = service.authenticate(db, data.email, data.password)
    return service.session_response(db, user, settings)


@router.get("/auth/me", response_model=MeResponse)
def me(user: CurrentUser, db: DB):
    return MeResponse(user=UserRead.model_validate(user), tenants=service.tenants_for(db, user))


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
    tenant.name = data.name
    db.commit()
    return _current_tenant(db, ctx)


@router.get("/tenants/current/members", response_model=list[MemberRead])
def list_members(db: DB, ctx: CurrentTenant):
    return service.list_members(db, ctx)


@router.post(
    "/tenants/current/members", response_model=MemberRead, status_code=status.HTTP_201_CREATED
)
def add_member(data: MemberCreate, db: DB, ctx: AdminTenant):
    return service.add_member(db, ctx, data)


@router.patch("/tenants/current/members/{membership_id}", response_model=MemberRead)
def update_member(membership_id: uuid.UUID, data: MemberUpdate, db: DB, ctx: AdminTenant):
    return service.update_member_role(db, ctx, membership_id, data.role)


@router.delete("/tenants/current/members/{membership_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(membership_id: uuid.UUID, db: DB, ctx: AdminTenant):
    service.remove_member(db, ctx, membership_id)
