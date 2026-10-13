import hashlib
import re
import secrets
import uuid
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.db import bind_tenant, unbind_tenant, utcnow
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound, Unauthorized
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
    password_fingerprint,
    verify_password,
)
from app.modules.notifications.email import EmailBackend
from app.modules.tenancy.context import TenantContext
from app.modules.tenancy.emails import invite_email, password_reset_email
from app.modules.tenancy.models import Membership, MembershipInvite, Role, Tenant, User
from app.modules.tenancy.schemas import (
    InviteAccept,
    InviteCreate,
    InvitePublic,
    InviteRead,
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


# --- Invitations to join an account --------------------------------------------------------


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _invite_read(invite: MembershipInvite) -> InviteRead:
    return InviteRead(
        id=invite.id,
        email=invite.email,
        role=invite.role,
        invited_by_name=invite.invited_by.full_name if invite.invited_by else None,
        created_at=invite.created_at,
        expires_at=invite.expires_at,
    )


def list_invites(db: Session) -> list[InviteRead]:
    invites = db.scalars(
        select(MembershipInvite)
        .where(MembershipInvite.expires_at > utcnow())
        .order_by(MembershipInvite.created_at)
    ).all()
    return [_invite_read(i) for i in invites]


def invite_member(
    db: Session,
    ctx: TenantContext,
    data: InviteCreate,
    settings: Settings,
    mailer: EmailBackend,
) -> InviteRead:
    """Email someone an invitation to join the account. Nothing changes until they accept."""
    if data.role == Role.owner and ctx.role != Role.owner:
        raise Forbidden("Only owners can invite other owners")
    email = normalise_email(data.email)
    already = db.scalar(
        select(Membership.id)
        .join(User)
        .where(User.email == email, Membership.tenant_id == ctx.tenant_id)
    )
    if already is not None:
        raise Conflict("This person is already a member of the account")

    token = secrets.token_urlsafe(32)
    invite = db.scalar(select(MembershipInvite).where(MembershipInvite.email == email))
    if invite is None:
        invite = MembershipInvite(email=email)
        db.add(invite)
    # Re-inviting replaces the earlier link and refreshes the role and expiry.
    invite.role = data.role
    invite.token_hash = _hash_token(token)
    invite.invited_by_id = ctx.user_id
    invite.expires_at = utcnow() + timedelta(days=settings.invite_expire_days)
    db.flush()

    inviter = db.get(User, ctx.user_id)
    tenant = db.get(Tenant, ctx.tenant_id)
    mailer.send(
        invite_email(
            to=email,
            account_name=tenant.name,
            inviter_name=inviter.full_name if inviter else None,
            role=data.role.value,
            link=f"{settings.public_app_url.rstrip('/')}/invite/{token}",
            expires_in_days=settings.invite_expire_days,
        )
    )
    db.commit()
    db.refresh(invite)
    return _invite_read(invite)


def revoke_invite(db: Session, invite_id: uuid.UUID) -> None:
    invite = db.get(MembershipInvite, invite_id)
    if invite is None:
        raise NotFound("Invitation not found")
    db.delete(invite)
    db.commit()


def _invite_for_token(db: Session, token: str) -> MembershipInvite:
    invite = db.scalar(
        select(MembershipInvite).where(MembershipInvite.token_hash == _hash_token(token))
    )
    if invite is None or invite.expires_at <= utcnow():
        raise NotFound(
            "This invitation link is not valid or has expired. Ask to be invited again.",
            code="invalid_invite",
        )
    # The link identifies the account; scope the rest of the request to it.
    bind_tenant(db, invite.tenant_id)
    return invite


def invite_details(db: Session, token: str) -> InvitePublic:
    invite = _invite_for_token(db, token)
    has_account = db.scalar(select(User.id).where(User.email == invite.email)) is not None
    return InvitePublic(
        account_id=invite.tenant_id,
        account_name=invite.tenant.name,
        email=invite.email,
        role=invite.role,
        invited_by_name=invite.invited_by.full_name if invite.invited_by else None,
        expires_at=invite.expires_at,
        has_account=has_account,
    )


def accept_invite(
    db: Session, token: str, data: InviteAccept, current_user: User | None, settings: Settings
) -> SessionResponse:
    """Join the account the link belongs to, signing up first if the person has no login.

    The invitation is tied to the address it was sent to: a signed-in user with a different
    address cannot take it, and a new login is created with the invited address.
    """
    invite = _invite_for_token(db, token)
    existing = db.scalar(select(User).where(User.email == invite.email))
    if current_user is not None:
        if current_user.email != invite.email:
            raise Forbidden(
                f"This invitation was sent to {invite.email}. "
                "Sign in with that address to accept it.",
                code="invite_email_mismatch",
            )
        user = current_user
    elif existing is not None:
        raise Unauthorized(
            "You already have a login for this address. Sign in to accept the invitation.",
            code="sign_in_required",
        )
    else:
        if not data.full_name or not data.password:
            raise BadRequest(
                "Choose your name and a password to create your login",
                code="new_user_details_required",
            )
        user = User(
            email=invite.email, full_name=data.full_name, password_hash=hash_password(data.password)
        )
        db.add(user)
        db.flush()

    member = db.scalar(select(Membership).where(Membership.user_id == user.id))
    if member is None:
        db.add(Membership(user_id=user.id, role=invite.role))
    db.delete(invite)
    db.commit()
    # The session is still scoped to the invite's account; the reply lists all of theirs.
    unbind_tenant(db)
    return session_response(db, user, settings)


# --- Passwords ---------------------------------------------------------------------------


def change_password(db: Session, user: User, current_password: str, new_password: str) -> None:
    if not verify_password(user.password_hash, current_password):
        raise BadRequest("Your current password is not right", code="wrong_password")
    user.password_hash = hash_password(new_password)
    db.commit()


def request_password_reset(
    db: Session, email: str, settings: Settings, mailer: EmailBackend
) -> None:
    """Email a reset link if a login exists for the address. The caller answers the same way
    either way, so the request cannot be used to find out which addresses are registered."""
    user = db.scalar(select(User).where(User.email == normalise_email(email)))
    if user is None or not user.is_active:
        return
    token = create_password_reset_token(user.id, user.password_hash, settings)
    mailer.send(
        password_reset_email(
            to=user.email,
            name=user.full_name,
            link=f"{settings.public_app_url.rstrip('/')}/reset-password/{token}",
            expires_in_minutes=settings.password_reset_expire_minutes,
        )
    )


def reset_password(
    db: Session, token: str, new_password: str, settings: Settings
) -> SessionResponse:
    decoded = decode_password_reset_token(token, settings)
    user = db.get(User, decoded[0]) if decoded else None
    if (
        decoded is None
        or user is None
        or not user.is_active
        or password_fingerprint(user.password_hash) != decoded[1]
    ):
        raise BadRequest(
            "This reset link has expired or has already been used. Ask for a new one.",
            code="invalid_reset_token",
        )
    user.password_hash = hash_password(new_password)
    db.commit()
    return session_response(db, user, settings)


# --- Members -----------------------------------------------------------------------------


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
