import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field

from app.core.schemas import ORMModel
from app.modules.weddings.models import EventKind


class EventBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: EventKind = EventKind.other
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    venue_name: str | None = Field(default=None, max_length=200)
    venue_address: str | None = None
    details: str | None = None
    rsvp_deadline: date | None = None


class EventCreate(EventBase):
    sort_order: int | None = None


class EventUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    kind: EventKind | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    venue_name: str | None = Field(default=None, max_length=200)
    venue_address: str | None = None
    details: str | None = None
    rsvp_deadline: date | None = None
    sort_order: int | None = None


class EventRead(ORMModel):
    id: uuid.UUID
    wedding_id: uuid.UUID
    kind: EventKind
    name: str
    starts_at: datetime | None
    ends_at: datetime | None
    venue_name: str | None
    venue_address: str | None
    details: str | None
    rsvp_deadline: date | None
    sort_order: int


class WeddingCreate(BaseModel):
    partner_one_name: str = Field(min_length=1, max_length=120)
    partner_two_name: str = Field(min_length=1, max_length=120)
    title: str | None = Field(default=None, max_length=200)
    wedding_date: date | None = None
    contact_email: EmailStr | None = None
    notes: str | None = None
    # Create the usual "day" and "evening" events straight away.
    create_default_events: bool = True


class WeddingUpdate(BaseModel):
    partner_one_name: str | None = Field(default=None, min_length=1, max_length=120)
    partner_two_name: str | None = Field(default=None, min_length=1, max_length=120)
    # Blank resets the title to the couple's names.
    title: str | None = Field(default=None, max_length=200)
    wedding_date: date | None = None
    contact_email: EmailStr | None = None
    notes: str | None = None


class WeddingRead(ORMModel):
    id: uuid.UUID
    title: str
    partner_one_name: str
    partner_two_name: str
    couple_names: str
    wedding_date: date | None
    contact_email: str | None
    notes: str | None
    created_at: datetime
    events: list[EventRead]
