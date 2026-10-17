import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.core.schemas import ORMModel
from app.modules.tenancy.models import Role


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    full_name: str = Field(min_length=1, max_length=200)
    account_name: str = Field(min_length=1, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserRead(ORMModel):
    id: uuid.UUID
    email: str
    full_name: str


class TenantRead(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    role: Role


class SessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
    tenants: list[TenantRead]


class MeResponse(BaseModel):
    user: UserRead
    tenants: list[TenantRead]


class TenantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class TenantUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class MemberUpdate(BaseModel):
    role: Role


class MemberRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    full_name: str
    role: Role


class InviteCreate(BaseModel):
    email: EmailStr
    role: Role = Role.editor


class InviteRead(BaseModel):
    id: uuid.UUID
    email: str
    role: Role
    invited_by_name: str | None
    created_at: datetime
    expires_at: datetime


class InvitePublic(BaseModel):
    """What the person holding an invitation link is shown before they accept it."""

    account_id: uuid.UUID
    account_name: str
    email: str
    role: Role
    invited_by_name: str | None
    expires_at: datetime
    # True when a login already exists for the invited address, so the page asks them to
    # sign in rather than create another account.
    has_account: bool


class InviteAccept(BaseModel):
    # Needed only when the invited person has no login yet.
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    password: str | None = Field(default=None, min_length=8, max_length=200)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class PasswordResetRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=200)


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    # Without this the key only reads. With it, the key can do what its owner's role allows.
    can_write: bool = False
    # Also lets the key queue email: sending invitations, test sends, member invitations.
    can_send: bool = False
    # Leave empty for a key that does not expire.
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class ApiKeyRead(BaseModel):
    id: uuid.UUID
    name: str
    # The first characters of the key, e.g. "wp_a1b2c3d4", to tell keys apart.
    prefix: str
    can_write: bool
    can_send: bool
    user_id: uuid.UUID
    user_name: str
    created_at: datetime
    expires_at: datetime | None
    last_used_at: datetime | None


class ApiKeyCreated(ApiKeyRead):
    """Returned once, when the key is made: the only time the secret itself is shown."""

    key: str
