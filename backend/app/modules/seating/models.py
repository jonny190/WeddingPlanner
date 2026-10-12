import uuid
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, IdMixin, TenantScoped, TimestampMixin, enum_type
from app.modules.guests.models import Guest


class TableShape(StrEnum):
    round = "round"
    rectangle = "rectangle"


class ConstraintKind(StrEnum):
    apart = "apart"
    together = "together"


class SeatingTable(IdMixin, TimestampMixin, TenantScoped, Base):
    """A table in the room layout for one event."""

    __tablename__ = "seating_tables"
    __table_args__ = (CheckConstraint("capacity > 0", name="capacity_positive"),)

    wedding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("weddings.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    capacity: Mapped[int] = mapped_column()
    shape: Mapped[TableShape] = mapped_column(enum_type(TableShape), default=TableShape.round)
    sort_order: Mapped[int] = mapped_column(default=0)


class SeatingConstraint(IdMixin, TimestampMixin, TenantScoped, Base):
    """A rule about two guests, applied to every event's seating plan.

    The pair is stored in a canonical order so (A, B) and (B, A) are the same rule.
    """

    __tablename__ = "seating_constraints"
    __table_args__ = (
        UniqueConstraint("wedding_id", "guest_a_id", "guest_b_id"),
        CheckConstraint("guest_a_id <> guest_b_id", name="distinct_guests"),
    )

    wedding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("weddings.id", ondelete="CASCADE"), index=True
    )
    guest_a_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("guests.id", ondelete="CASCADE"), index=True
    )
    guest_b_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("guests.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[ConstraintKind] = mapped_column(
        enum_type(ConstraintKind), default=ConstraintKind.apart
    )
    note: Mapped[str | None] = mapped_column(String(255))

    guest_a: Mapped[Guest] = relationship(foreign_keys=[guest_a_id])
    guest_b: Mapped[Guest] = relationship(foreign_keys=[guest_b_id])


class SeatAssignment(IdMixin, TimestampMixin, TenantScoped, Base):
    """Places a guest (and their plus-one) at a table for an event."""

    __tablename__ = "seat_assignments"

    wedding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("weddings.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    table_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("seating_tables.id", ondelete="CASCADE"), index=True
    )
    # Uninviting a guest from the event removes their seat too.
    invitation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("event_invitations.id", ondelete="CASCADE"), unique=True
    )
    guest_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("guests.id", ondelete="CASCADE"), index=True
    )
    # Locked seats are kept when the plan is auto-arranged.
    locked: Mapped[bool] = mapped_column(default=False)
