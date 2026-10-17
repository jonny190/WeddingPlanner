import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, IdMixin, TenantScoped, TimestampMixin, enum_type


class EventKind(StrEnum):
    day = "day"
    evening = "evening"
    other = "other"


class VenueStatus(StrEnum):
    considering = "considering"
    shortlisted = "shortlisted"
    booked = "booked"
    declined = "declined"


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
    # A venue chosen from the wedding's venue list. While one is chosen, its name and address
    # are what venue_name and venue_address give (invitations, the RSVP page and calendar
    # entries all read those); the typed-in columns below are kept as the fallback.
    venue_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("venues.id", ondelete="SET NULL"), index=True
    )
    _venue_name: Mapped[str | None] = mapped_column("venue_name", String(200))
    _venue_address: Mapped[str | None] = mapped_column("venue_address", Text)
    details: Mapped[str | None] = mapped_column(Text)
    rsvp_deadline: Mapped[date | None] = mapped_column(Date)
    sort_order: Mapped[int] = mapped_column(default=0)

    wedding: Mapped[Wedding] = relationship(back_populates="events")
    venue: Mapped["Venue | None"] = relationship(lazy="joined")

    @property
    def venue_name(self) -> str | None:
        return self.venue.name if self.venue is not None else self._venue_name

    @venue_name.setter
    def venue_name(self, value: str | None) -> None:
        self._venue_name = value

    @property
    def venue_address(self) -> str | None:
        return self.venue.address if self.venue is not None else self._venue_address

    @venue_address.setter
    def venue_address(self, value: str | None) -> None:
        self._venue_address = value


class Venue(IdMixin, TimestampMixin, TenantScoped, Base):
    """A venue the couple are considering, have shortlisted or have booked, with what it
    costs, how to reach it and who to talk to there."""

    __tablename__ = "venues"

    wedding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("weddings.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[VenueStatus] = mapped_column(
        enum_type(VenueStatus), default=VenueStatus.considering
    )
    address: Mapped[str | None] = mapped_column(Text)
    website: Mapped[str | None] = mapped_column(String(500))
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(50))
    capacity: Mapped[int | None] = mapped_column()
    # Prices are plain amounts in the venue's currency; asdecimal=False keeps them floats
    # everywhere, which is all a planning estimate needs.
    price: Mapped[float | None] = mapped_column(Numeric(12, 2, asdecimal=False))
    price_per_head: Mapped[float | None] = mapped_column(Numeric(12, 2, asdecimal=False))
    deposit: Mapped[float | None] = mapped_column(Numeric(12, 2, asdecimal=False))
    currency: Mapped[str] = mapped_column(String(3), default="GBP")
    price_notes: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)

    contacts: Mapped[list["VenueContact"]] = relationship(
        back_populates="venue",
        order_by="VenueContact.sort_order",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )


class VenueContact(IdMixin, TimestampMixin, TenantScoped, Base):
    """Someone to speak to at a venue: the coordinator, the catering manager, and so on."""

    __tablename__ = "venue_contacts"

    venue_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("venues.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str | None] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(50))
    sort_order: Mapped[int] = mapped_column(default=0)

    venue: Mapped[Venue] = relationship(back_populates="contacts")
