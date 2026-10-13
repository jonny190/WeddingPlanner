import uuid

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, IdMixin, TenantScoped, TimestampMixin


class MenuCourse(IdMixin, TimestampMixin, TenantScoped, Base):
    """One course of an event's meal (starter, main, dessert), with the dishes on offer."""

    __tablename__ = "menu_courses"

    wedding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("weddings.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(default=0)

    options: Mapped[list["MenuOption"]] = relationship(
        back_populates="course",
        order_by="MenuOption.sort_order",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class MenuOption(IdMixin, TimestampMixin, TenantScoped, Base):
    """A dish a guest can pick for a course."""

    __tablename__ = "menu_options"

    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("menu_courses.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(default=0)

    course: Mapped[MenuCourse] = relationship(back_populates="options")


class MenuChoice(IdMixin, TimestampMixin, TenantScoped, Base):
    """What one person is having for one course: the guest, or the guest they are bringing."""

    __tablename__ = "menu_choices"
    __table_args__ = (UniqueConstraint("invitation_id", "course_id", "for_plus_one"),)

    invitation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("event_invitations.id", ondelete="CASCADE"), index=True
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("menu_courses.id", ondelete="CASCADE"), index=True
    )
    option_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("menu_options.id", ondelete="CASCADE"), index=True
    )
    for_plus_one: Mapped[bool] = mapped_column(default=False)
