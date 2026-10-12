import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.core.schemas import ORMModel
from app.modules.invitations.design import FontOption, InvitationDesign
from app.modules.invitations.models import DeliveryChannel, DeliveryStatus, DraftStatus


class DraftCreate(BaseModel):
    name: str = Field(default="Invitation", min_length=1, max_length=120)
    # Left empty, these are filled with a template suited to the event.
    subject: str | None = Field(default=None, max_length=255)
    body: str | None = None
    design: InvitationDesign | None = None
    # Start from a copy of another draft (from any event of the same wedding).
    copy_from_draft_id: uuid.UUID | None = None


class DraftUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    subject: str | None = Field(default=None, min_length=1, max_length=255)
    body: str | None = Field(default=None, min_length=1)
    design: InvitationDesign | None = None


class DraftRead(ORMModel):
    id: uuid.UUID
    wedding_id: uuid.UUID
    event_id: uuid.UUID
    name: str
    subject: str
    body: str
    design: InvitationDesign | None
    status: DraftStatus
    last_sent_at: datetime | None
    sent_count: int
    created_at: datetime
    updated_at: datetime


class PreviewRequest(BaseModel):
    # Preview as this guest; otherwise an example guest is used.
    guest_id: uuid.UUID | None = None
    # Preview unsaved edits without storing them.
    subject: str | None = None
    body: str | None = None
    design: InvitationDesign | None = None


class PreviewResponse(BaseModel):
    subject: str
    text: str
    html: str
    unknown_placeholders: list[str]
    guest_name: str
    # The card with this guest's details filled in, as shown on their RSVP page.
    card: InvitationDesign
    fonts: list[FontOption]


class Audience(StrEnum):
    # Invited guests who have not been sent this event's invitation yet.
    unsent = "unsent"
    # Invited guests who have not replied (useful as a reminder).
    pending = "pending"
    # Opened the invitation link but have not replied yet.
    opened_no_reply = "opened_no_reply"
    # Were sent the invitation but have never opened the link, and have not replied.
    not_opened = "not_opened"
    # Everyone invited to the event.
    all = "all"
    # Just the guests listed in guest_ids.
    selected = "selected"


class SendRequest(BaseModel):
    audience: Audience = Audience.unsent
    guest_ids: list[uuid.UUID] = []
    # Report who would receive it without sending anything.
    dry_run: bool = False

    @model_validator(mode="after")
    def _guests_for_selected(self) -> "SendRequest":
        if self.audience == Audience.selected and not self.guest_ids:
            raise ValueError("guest_ids is required when audience is 'selected'")
        return self


class Recipient(BaseModel):
    guest_id: uuid.UUID
    full_name: str
    email: str | None


class SendResult(BaseModel):
    dry_run: bool
    queued: list[Recipient]
    skipped_no_email: list[Recipient]


class TestSendRequest(BaseModel):
    email: EmailStr
    guest_id: uuid.UUID | None = None


class MarkSentRequest(BaseModel):
    guest_ids: list[uuid.UUID] = Field(min_length=1)


class DeliveryRead(ORMModel):
    id: uuid.UUID
    event_id: uuid.UUID
    draft_id: uuid.UUID | None
    guest_id: uuid.UUID | None
    guest_name: str | None = None
    channel: DeliveryChannel
    is_test: bool
    to_address: str | None
    subject: str
    status: DeliveryStatus
    error: str | None
    attempts: int
    created_at: datetime
    sent_at: datetime | None


class Placeholder(BaseModel):
    name: str
    description: str


class LinkOpenResult(BaseModel):
    rsvp_token: str
    event_id: uuid.UUID
