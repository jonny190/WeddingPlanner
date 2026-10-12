import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import (
    Base,
    IdMixin,
    JSONDocument,
    TenantScoped,
    TimestampMixin,
    enum_type,
    utcnow,
)


class DraftStatus(StrEnum):
    draft = "draft"
    sent = "sent"


class DeliveryStatus(StrEnum):
    queued = "queued"
    sending = "sending"
    sent = "sent"
    failed = "failed"
    skipped = "skipped"


class DeliveryChannel(StrEnum):
    email = "email"
    # Recorded by the couple for invitations handed over or posted.
    manual = "manual"


class InvitationDraft(IdMixin, TimestampMixin, TenantScoped, Base):
    """An invitation message for one event, written and previewed before it is sent."""

    __tablename__ = "invitation_drafts"

    wedding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("weddings.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    subject: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    # The card design (see invitations/design.py), validated on every write.
    design: Mapped[dict | None] = mapped_column(JSONDocument)
    status: Mapped[DraftStatus] = mapped_column(enum_type(DraftStatus), default=DraftStatus.draft)
    last_sent_at: Mapped[datetime | None] = mapped_column()
    sent_count: Mapped[int] = mapped_column(default=0)


class InvitationDelivery(IdMixin, TimestampMixin, TenantScoped, Base):
    """One invitation going to one guest. Doubles as the outbox the worker sends from."""

    __tablename__ = "invitation_deliveries"
    __table_args__ = (
        Index("ix_invitation_deliveries_status_next_attempt_at", "status", "next_attempt_at"),
    )

    wedding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("weddings.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    draft_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("invitation_drafts.id", ondelete="SET NULL"), index=True
    )
    guest_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("guests.id", ondelete="CASCADE"), index=True
    )
    invitation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("event_invitations.id", ondelete="SET NULL"), index=True
    )
    channel: Mapped[DeliveryChannel] = mapped_column(enum_type(DeliveryChannel))
    is_test: Mapped[bool] = mapped_column(default=False)
    # Secret in this email's link, so opening it can be attributed to the guest.
    tracking_token: Mapped[str | None] = mapped_column(String(64), unique=True)
    to_address: Mapped[str | None] = mapped_column(String(320))
    reply_to: Mapped[str | None] = mapped_column(String(320))
    # Snapshot of exactly what was sent, so editing the draft later does not rewrite history.
    subject: Mapped[str] = mapped_column(String(255))
    body_text: Mapped[str] = mapped_column(Text)
    body_html: Mapped[str | None] = mapped_column(Text)

    status: Mapped[DeliveryStatus] = mapped_column(enum_type(DeliveryStatus))
    error: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column()
    sent_at: Mapped[datetime | None] = mapped_column()


class InvitationLinkClick(IdMixin, TenantScoped, Base):
    """A guest opening the link in an invitation email."""

    __tablename__ = "invitation_link_clicks"

    wedding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("weddings.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    guest_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("guests.id", ondelete="CASCADE"), index=True
    )
    delivery_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("invitation_deliveries.id", ondelete="CASCADE"), index=True
    )
    clicked_at: Mapped[datetime] = mapped_column(default=utcnow)
    user_agent: Mapped[str | None] = mapped_column(String(400))
