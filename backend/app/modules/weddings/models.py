import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, IdMixin, TenantScoped, TimestampMixin, enum_type


class EventKind(StrEnum):
    day = "day"
    evening = "evening"
    other = "other"


class Wedding(IdMixin, TimestampMixin, TenantScoped, Base):
    __tablename__ = "weddings"

    title: Mapped[str] = mapped_column(String(200))
    partner_one_name: Mapped[str] = mapped_column(String(120))
    partner_two_name: Mapped[str] = mapped_column(String(120))
    wedding_date: Mapped[date | None] = mapped_column(Date)
    # Where guest replies to invitation emails should go.
    contact_email: Mapped[str | None] = mapped_column(String(320))
    notes: Mapped[str | None] = mapped_column(Text)

    events: Mapped[list["Event"]] = relationship(
        back_populates="wedding",
        order_by="Event.sort_order",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def couple_names(self) -> str:
        return f"{self.partner_one_name} & {self.partner_two_name}"


class Event(IdMixin, TimestampMixin, TenantScoped, Base):
    """A part of the wedding guests are invited to separately, e.g. the day or the evening."""

    __tablename__ = "events"

    wedding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("weddings.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[EventKind] = mapped_column(enum_type(EventKind))
    name: Mapped[str] = mapped_column(String(120))
    # Wall-clock time at the venue, deliberately stored without a timezone.
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    venue_name: Mapped[str | None] = mapped_column(String(200))
    venue_address: Mapped[str | None] = mapped_column(Text)
    details: Mapped[str | None] = mapped_column(Text)
    rsvp_deadline: Mapped[date | None] = mapped_column(Date)
    sort_order: Mapped[int] = mapped_column(default=0)

    wedding: Mapped[Wedding] = relationship(back_populates="events")
