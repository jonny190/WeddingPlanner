import uuid
from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from app.modules.guests.models import AgeGroup, ResponseChannel, RsvpStatus
from app.modules.invitations.design import FontOption, InvitationDesign
from app.modules.weddings.models import EventKind


class Engagement(StrEnum):
    """How far a guest has got with an invitation."""

    not_sent = "not_sent"
    sent = "sent"
    # Opened the link in the email but has not replied.
    opened = "opened"
    responded = "responded"


# --- Public (guest-facing) ----------------------------------------------------------------


class RsvpEventCalendar(BaseModel):
    """Ways to put this event in the guest's own calendar."""

    # The .ics download for this event, on this deployment.
    ics_url: str
    google_url: str
    outlook_url: str


class RsvpEvent(BaseModel):
    event_id: uuid.UUID
    name: str
    kind: EventKind
    starts_at: datetime | None
    ends_at: datetime | None
    venue_name: str | None
    venue_address: str | None
    details: str | None
    rsvp_deadline: date | None
    plus_one_allowed: bool
    rsvp_status: RsvpStatus
    plus_one_attending: bool | None
    plus_one_name: str | None
    plus_one_dietary: str | None
    # The designed invitation card, personalised for this guest.
    card: InvitationDesign
    # None when the event has no date or time to build an entry from.
    calendar: RsvpEventCalendar | None = None


class RsvpView(BaseModel):
    first_name: str
    full_name: str
    couple_names: str
    wedding_title: str
    wedding_date: date | None
    dietary_requirements: str | None
    message: str | None
    has_responded: bool
    events: list[RsvpEvent]
    # Web fonts the cards use.
    fonts: list[FontOption]


class RsvpEventResponse(BaseModel):
    event_id: uuid.UUID
    attending: bool
    plus_one_attending: bool | None = None
    plus_one_name: str | None = Field(default=None, max_length=200)
    plus_one_dietary: str | None = Field(default=None, max_length=2000)


class RsvpSubmit(BaseModel):
    responses: list[RsvpEventResponse] = Field(min_length=1)
    dietary_requirements: str | None = Field(default=None, max_length=2000)
    message: str | None = Field(default=None, max_length=2000)


# --- Host-facing --------------------------------------------------------------------------


class ReplyRow(BaseModel):
    guest_id: uuid.UUID
    invitation_id: uuid.UUID
    full_name: str
    email: str | None
    group_name: str | None
    age_group: AgeGroup
    rsvp_token: str
    plus_one_allowed: bool
    rsvp_status: RsvpStatus
    plus_one_attending: bool | None
    plus_one_name: str | None
    plus_one_dietary: str | None
    dietary_requirements: str | None
    guest_message: str | None
    responded_at: datetime | None
    response_channel: ResponseChannel | None
    first_sent_at: datetime | None
    last_sent_at: datetime | None
    first_clicked_at: datetime | None
    last_clicked_at: datetime | None
    click_count: int
    engagement: Engagement


class ReplyUpdate(BaseModel):
    """A reply received by phone, post or in person, recorded by the couple."""

    rsvp_status: RsvpStatus
    plus_one_attending: bool | None = None
    plus_one_name: str | None = Field(default=None, max_length=200)
    plus_one_dietary: str | None = Field(default=None, max_length=2000)
    dietary_requirements: str | None = Field(default=None, max_length=2000)
    guest_message: str | None = Field(default=None, max_length=2000)


class DietaryNote(BaseModel):
    name: str
    requirements: str


class EventReplySummary(BaseModel):
    event_id: uuid.UUID
    event_name: str
    kind: EventKind
    invited: int
    invites_sent: int
    invites_not_sent: int
    # Guests who opened the link in their invitation email.
    opened: int
    # ...and still have not replied: worth a nudge.
    opened_no_reply: int
    attending: int
    declined: int
    pending: int
    plus_ones_allowed: int
    plus_ones_attending: int
    # Guests and plus-ones who have said yes.
    confirmed_headcount: int
    # Confirmed plus everyone who has not replied yet (and their plus-ones).
    potential_headcount: int
    children_attending: int
    dietary: list[DietaryNote]


class WeddingSummary(BaseModel):
    wedding_id: uuid.UUID
    guests_total: int
    guests_without_email: int
    events: list[EventReplySummary]
