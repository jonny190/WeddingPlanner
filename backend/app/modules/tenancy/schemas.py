import uuid

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


class MemberCreate(BaseModel):
    email: EmailStr
    role: Role = Role.editor
    # Only needed when the person does not have an account yet.
    full_name: str | None = Field(default=None, max_length=200)
    password: str | None = Field(default=None, min_length=8, max_length=200)


class MemberUpdate(BaseModel):
    role: Role


class MemberRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    full_name: str
    role: Role
