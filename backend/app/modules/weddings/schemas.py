import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field

from app.core.schemas import ORMModel
from app.modules.weddings.models import EventKind, VenueStatus


class EventBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: EventKind = EventKind.other
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    # A venue from the wedding's list. While set, it supplies venue_name and venue_address.
    venue_id: uuid.UUID | None = None
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
    venue_id: uuid.UUID | None = None
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
    venue_id: uuid.UUID | None
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


# --- Venues ---------------------------------------------------------------------------------


class VenueContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)


class VenueContactRead(ORMModel):
    id: uuid.UUID
    name: str
    role: str | None
    email: str | None
    phone: str | None


class VenueBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    status: VenueStatus = VenueStatus.considering
    address: str | None = Field(default=None, max_length=1000)
    website: str | None = Field(default=None, max_length=500)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    capacity: int | None = Field(default=None, ge=0, le=100000)
    # Hire price, per-head price and deposit, in the venue's currency.
    price: float | None = Field(default=None, ge=0)
    price_per_head: float | None = Field(default=None, ge=0)
    deposit: float | None = Field(default=None, ge=0)
    currency: str = Field(default="GBP", pattern=r"^[A-Z]{3}$")
    price_notes: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=5000)


class VenueCreate(VenueBase):
    contacts: list[VenueContactIn] = Field(default_factory=list, max_length=10)


class VenueUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    status: VenueStatus | None = None
    address: str | None = Field(default=None, max_length=1000)
    website: str | None = Field(default=None, max_length=500)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    capacity: int | None = Field(default=None, ge=0, le=100000)
    price: float | None = Field(default=None, ge=0)
    price_per_head: float | None = Field(default=None, ge=0)
    deposit: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    price_notes: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=5000)
    # When given, replaces the venue's contacts.
    contacts: list[VenueContactIn] | None = Field(default=None, max_length=10)


class VenueUse(BaseModel):
    event_id: uuid.UUID
    event_name: str


class VenueRead(ORMModel):
    id: uuid.UUID
    wedding_id: uuid.UUID
    name: str
    status: VenueStatus
    address: str | None
    website: str | None
    email: str | None
    phone: str | None
    capacity: int | None
    price: float | None
    price_per_head: float | None
    deposit: float | None
    currency: str
    price_notes: str | None
    notes: str | None
    created_at: datetime
    contacts: list[VenueContactRead]
    # The events this venue has been chosen for.
    used_for: list[VenueUse] = []
