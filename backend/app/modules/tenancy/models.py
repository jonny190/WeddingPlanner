import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, IdMixin, TenantScoped, TimestampMixin, enum_type


class Role(StrEnum):
    owner = "owner"
    admin = "admin"
    editor = "editor"
    viewer = "viewer"


ROLE_RANK = {Role.viewer: 0, Role.editor: 1, Role.admin: 2, Role.owner: 3}


class Tenant(IdMixin, TimestampMixin, Base):
    """An account on the platform: a couple, or a planning business with many weddings."""

    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(80), unique=True)


class User(IdMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True)
    full_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)


class Membership(IdMixin, TimestampMixin, TenantScoped, Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[Role] = mapped_column(enum_type(Role))

    user: Mapped[User] = relationship(lazy="joined")
    tenant: Mapped[Tenant] = relationship(lazy="joined")


class MembershipInvite(IdMixin, TimestampMixin, TenantScoped, Base):
    """An offer to join an account, sent by email. Nobody is added to an account until they
    open the link themselves, so a membership is always something the person agreed to."""

    __tablename__ = "membership_invites"
    __table_args__ = (UniqueConstraint("tenant_id", "email"),)

    email: Mapped[str] = mapped_column(String(320))
    role: Mapped[Role] = mapped_column(enum_type(Role))
    # Only a hash of the secret in the link is kept, so the table alone cannot be used
    # to accept invitations.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    invited_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    expires_at: Mapped[datetime] = mapped_column()

    invited_by: Mapped[User | None] = relationship(lazy="joined")
    tenant: Mapped[Tenant] = relationship(lazy="joined")
