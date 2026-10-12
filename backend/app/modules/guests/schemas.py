import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.core.schemas import ORMModel
from app.modules.guests.models import AgeGroup, ResponseChannel, RsvpStatus


class InvitationSpec(BaseModel):
    event_id: uuid.UUID
    plus_one_allowed: bool = False


class GuestBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default="", max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    group_name: str | None = Field(default=None, max_length=100)
    age_group: AgeGroup = AgeGroup.adult
    dietary_requirements: str | None = None
    notes: str | None = None


class GuestCreate(GuestBase):
    invitations: list[InvitationSpec] = []


class GuestUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    group_name: str | None = Field(default=None, max_length=100)
    age_group: AgeGroup | None = None
    dietary_requirements: str | None = None
    notes: str | None = None
    # When provided, replaces the guest's set of event invitations.
    invitations: list[InvitationSpec] | None = None


class EventInvitationRead(ORMModel):
    id: uuid.UUID
    event_id: uuid.UUID
    guest_id: uuid.UUID
    plus_one_allowed: bool
    rsvp_status: RsvpStatus
    plus_one_attending: bool | None
    plus_one_name: str | None
    plus_one_dietary: str | None
    guest_message: str | None
    responded_at: datetime | None
    response_channel: ResponseChannel | None
    first_sent_at: datetime | None
    last_sent_at: datetime | None
    first_clicked_at: datetime | None
    last_clicked_at: datetime | None
    click_count: int


class GuestRead(ORMModel):
    id: uuid.UUID
    wedding_id: uuid.UUID
    first_name: str
    last_name: str
    full_name: str
    email: str | None
    phone: str | None
    group_name: str | None
    age_group: AgeGroup
    dietary_requirements: str | None
    notes: str | None
    rsvp_token: str
    created_at: datetime
    invitations: list[EventInvitationRead]


class InvitationUpsert(BaseModel):
    plus_one_allowed: bool = False


class BulkInvite(BaseModel):
    guest_ids: list[uuid.UUID] = Field(min_length=1)
    # None leaves an existing invitation's plus-one setting untouched.
    plus_one_allowed: bool | None = None


class BulkUninvite(BaseModel):
    guest_ids: list[uuid.UUID] = Field(min_length=1)


class BulkResult(BaseModel):
    affected: int


class ImportRowError(BaseModel):
    row: int
    message: str


class ImportResult(BaseModel):
    created: int
    errors: list[ImportRowError]
