import secrets
import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, IdMixin, TenantScoped, TimestampMixin, enum_type
from app.modules.weddings.models import Event


class AgeGroup(StrEnum):
    adult = "adult"
    child = "child"
    infant = "infant"


class RsvpStatus(StrEnum):
    pending = "pending"
    attending = "attending"
    declined = "declined"


class ResponseChannel(StrEnum):
    online = "online"
    manual = "manual"


def _new_rsvp_token() -> str:
    return secrets.token_urlsafe(24)


class Guest(IdMixin, TimestampMixin, TenantScoped, Base):
    __tablename__ = "guests"

    wedding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("weddings.id", ondelete="CASCADE"), index=True
    )
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100), default="")
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(50))
    # Free-text grouping such as "Bride's family"; the seating planner keeps groups together.
    group_name: Mapped[str | None] = mapped_column(String(100))
    age_group: Mapped[AgeGroup] = mapped_column(enum_type(AgeGroup), default=AgeGroup.adult)
    dietary_requirements: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    # Secret used in the guest's personal RSVP link.
    rsvp_token: Mapped[str] = mapped_column(String(64), unique=True, default=_new_rsvp_token)

    invitations: Mapped[list["EventInvitation"]] = relationship(
        back_populates="guest", cascade="all, delete-orphan", passive_deletes=True
    )

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class EventInvitation(IdMixin, TimestampMixin, TenantScoped, Base):
    """A guest's invitation to one event, tracked independently per event (day, evening...)."""

    __tablename__ = "event_invitations"
    __table_args__ = (UniqueConstraint("event_id", "guest_id"),)

    wedding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("weddings.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    guest_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("guests.id", ondelete="CASCADE"), index=True
    )
    plus_one_allowed: Mapped[bool] = mapped_column(default=False)

    rsvp_status: Mapped[RsvpStatus] = mapped_column(
        enum_type(RsvpStatus), default=RsvpStatus.pending
    )
    plus_one_attending: Mapped[bool | None] = mapped_column()
    plus_one_name: Mapped[str | None] = mapped_column(String(200))
    plus_one_dietary: Mapped[str | None] = mapped_column(Text)
    guest_message: Mapped[str | None] = mapped_column(Text)
    responded_at: Mapped[datetime | None] = mapped_column()
    response_channel: Mapped[ResponseChannel | None] = mapped_column(enum_type(ResponseChannel))

    first_sent_at: Mapped[datetime | None] = mapped_column()
    last_sent_at: Mapped[datetime | None] = mapped_column()
    # Opens of the tracked link in the invitation email.
    first_clicked_at: Mapped[datetime | None] = mapped_column()
    last_clicked_at: Mapped[datetime | None] = mapped_column()
    click_count: Mapped[int] = mapped_column(default=0)

    guest: Mapped[Guest] = relationship(back_populates="invitations")
    event: Mapped[Event] = relationship()

    @property
    def party_size(self) -> int:
        """Seats/meals to plan for: 0 if declined, plus the plus-one unless they've said no."""
        if self.rsvp_status == RsvpStatus.declined:
            return 0
        bringing_plus_one = self.plus_one_allowed and self.plus_one_attending is not False
        return 1 + int(bringing_plus_one)

    def clear_plus_one(self) -> None:
        self.plus_one_attending = None
        self.plus_one_name = None
        self.plus_one_dietary = None
