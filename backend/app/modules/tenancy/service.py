import re
import secrets
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound, Unauthorized
from app.core.security import create_access_token, hash_password, verify_password
from app.modules.tenancy.context import TenantContext
from app.modules.tenancy.models import Membership, Role, Tenant, User
from app.modules.tenancy.schemas import (
    MemberCreate,
    MemberRead,
    SessionResponse,
    SignupRequest,
    TenantRead,
    UserRead,
)

_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def normalise_email(email: str) -> str:
    return email.strip().lower()


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:60] or "account"


def _unique_slug(db: Session, name: str) -> str:
    base = _slugify(name)
    slug = base
    while db.scalar(select(Tenant.id).where(Tenant.slug == slug)) is not None:
        slug = f"{base}-{secrets.token_hex(3)}"
    return slug


def tenants_for(db: Session, user: User) -> list[TenantRead]:
    memberships = db.scalars(
        select(Membership).where(Membership.user_id == user.id).order_by(Membership.created_at)
    ).all()
    return [
        TenantRead(id=m.tenant.id, name=m.tenant.name, slug=m.tenant.slug, role=m.role)
        for m in memberships
    ]


def create_tenant(db: Session, name: str, owner: User) -> Tenant:
    tenant = Tenant(name=name, slug=_unique_slug(db, name))
    db.add(tenant)
    db.flush()
    db.add(Membership(tenant_id=tenant.id, user_id=owner.id, role=Role.owner))
    return tenant


def session_response(db: Session, user: User, settings: Settings) -> SessionResponse:
    return SessionResponse(
        access_token=create_access_token(user.id, settings),
        user=UserRead.model_validate(user),
        tenants=tenants_for(db, user),
    )


def signup(db: Session, data: SignupRequest) -> User:
    email = normalise_email(data.email)
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise Conflict("An account with this email already exists", code="email_taken")
    user = User(email=email, full_name=data.full_name, password_hash=hash_password(data.password))
    db.add(user)
    db.flush()
    create_tenant(db, data.account_name, user)
    db.commit()
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == normalise_email(email)))
    # Hash even for unknown emails so response times don't reveal which accounts exist.
    valid = verify_password(user.password_hash if user else _DUMMY_HASH, password)
    if user is None or not user.is_active or not valid:
        raise Unauthorized("Incorrect email or password", code="invalid_credentials")
    return user


def _member_read(m: Membership) -> MemberRead:
    return MemberRead(
        id=m.id, user_id=m.user_id, email=m.user.email, full_name=m.user.full_name, role=m.role
    )


def list_members(db: Session, ctx: TenantContext) -> list[MemberRead]:
    members = db.scalars(select(Membership).order_by(Membership.created_at)).all()
    return [_member_read(m) for m in members]


def add_member(db: Session, ctx: TenantContext, data: MemberCreate) -> MemberRead:
    if data.role == Role.owner and ctx.role != Role.owner:
        raise Forbidden("Only owners can add other owners")
    email = normalise_email(data.email)
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        if not data.full_name or not data.password:
            raise BadRequest(
                "This person has no account yet; provide a full name and initial password",
                code="new_user_details_required",
            )
        user = User(
            email=email, full_name=data.full_name, password_hash=hash_password(data.password)
        )
        db.add(user)
        db.flush()
    elif db.scalar(select(Membership.id).where(Membership.user_id == user.id)) is not None:
        raise Conflict("This person is already a member of the account")
    membership = Membership(user_id=user.id, role=data.role)
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return _member_read(membership)


def _get_membership(db: Session, membership_id: uuid.UUID) -> Membership:
    membership = db.get(Membership, membership_id)
    if membership is None:
        raise NotFound("Member not found")
    return membership


def _ensure_another_owner(db: Session, membership: Membership) -> None:
    if membership.role != Role.owner:
        return
    owners = db.scalar(
        select(func.count()).select_from(Membership).where(Membership.role == Role.owner)
    )
    if owners <= 1:
        raise Conflict("An account must always have at least one owner")


def update_member_role(
    db: Session, ctx: TenantContext, membership_id: uuid.UUID, role: Role
) -> MemberRead:
    membership = _get_membership(db, membership_id)
    if Role.owner in (role, membership.role) and ctx.role != Role.owner:
        raise Forbidden("Only owners can change owner roles")
    if role != Role.owner:
        _ensure_another_owner(db, membership)
    membership.role = role
    db.commit()
    return _member_read(membership)


def remove_member(db: Session, ctx: TenantContext, membership_id: uuid.UUID) -> None:
    membership = _get_membership(db, membership_id)
    if membership.role == Role.owner and ctx.role != Role.owner:
        raise Forbidden("Only owners can remove other owners")
    _ensure_another_owner(db, membership)
    db.delete(membership)
    db.commit()
