"""Delivers queued invitation emails. Run continuously by the worker process (app/worker.py)."""

import logging
from datetime import timedelta

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.core.db import utcnow
from app.modules.guests.models import EventInvitation
from app.modules.invitations.models import DeliveryChannel, DeliveryStatus, InvitationDelivery
from app.modules.notifications.email import EmailBackend, EmailMessage
from app.modules.notifications.whatsapp import WhatsAppBackend, WhatsAppMessage

logger = logging.getLogger(__name__)

# A delivery stuck in "sending" this long was claimed by a worker that died; try again.
# A live worker touches every row it still holds before each send (see _heartbeat), so a
# slow SMTP server cannot make a healthy batch look abandoned, however large the batch.
STALE_AFTER = timedelta(minutes=10)


def _requeue_stale(db: Session) -> None:
    stale = db.scalars(
        select(InvitationDelivery).where(
            InvitationDelivery.status == DeliveryStatus.sending,
            InvitationDelivery.updated_at < utcnow() - STALE_AFTER,
        )
    ).all()
    for delivery in stale:
        delivery.status = DeliveryStatus.queued
    db.commit()


def _claim(db: Session, batch_size: int) -> list[InvitationDelivery]:
    """Lock a batch of due deliveries; SKIP LOCKED lets several workers run side by side."""
    now = utcnow()
    batch = db.scalars(
        select(InvitationDelivery)
        .where(
            InvitationDelivery.status == DeliveryStatus.queued,
            or_(
                InvitationDelivery.next_attempt_at.is_(None),
                InvitationDelivery.next_attempt_at <= now,
            ),
        )
        .order_by(InvitationDelivery.created_at)
        .limit(batch_size)
        .with_for_update(skip_locked=True)
    ).all()
    for delivery in batch:
        delivery.status = DeliveryStatus.sending
        delivery.attempts += 1
    db.commit()
    return list(batch)


def _heartbeat(db: Session, pending: list[InvitationDelivery]) -> None:
    """Mark the rows this worker still holds as alive, so no other worker re-queues them."""
    if not pending:
        return
    db.execute(
        update(InvitationDelivery)
        .where(
            InvitationDelivery.id.in_([d.id for d in pending]),
            InvitationDelivery.status == DeliveryStatus.sending,
        )
        .values(updated_at=utcnow())
    )
    db.commit()


def _record_sent(db: Session, delivery: InvitationDelivery) -> None:
    sent_at = utcnow()
    delivery.status = DeliveryStatus.sent
    delivery.sent_at = sent_at
    delivery.error = None
    if delivery.invitation_id and not delivery.is_test:
        invitation = db.get(EventInvitation, delivery.invitation_id)
        if invitation is not None:
            invitation.first_sent_at = invitation.first_sent_at or sent_at
            invitation.last_sent_at = sent_at


def _record_failure(delivery: InvitationDelivery, error: Exception, max_attempts: int) -> None:
    delivery.error = f"{type(error).__name__}: {error}"[:2000]
    if delivery.attempts >= max_attempts:
        delivery.status = DeliveryStatus.failed
    else:
        delivery.status = DeliveryStatus.queued
        delivery.next_attempt_at = utcnow() + timedelta(minutes=2**delivery.attempts)


def dispatch_due_deliveries(
    session_factory: sessionmaker,
    backend: EmailBackend,
    settings: Settings,
    whatsapp: WhatsAppBackend | None = None,
) -> int:
    """Send one batch of due deliveries, by email or WhatsApp. Returns how many were tried."""
    with session_factory() as db:
        _requeue_stale(db)
        batch = _claim(db, settings.worker_batch_size)
        for index, delivery in enumerate(batch):
            _heartbeat(db, batch[index:])
            try:
                if delivery.channel == DeliveryChannel.whatsapp:
                    if whatsapp is None:
                        raise RuntimeError("WhatsApp sending is not configured on this worker")
                    whatsapp.send(
                        WhatsAppMessage(to=delivery.to_address or "", text=delivery.body_text)
                    )
                else:
                    backend.send(
                        EmailMessage(
                            to=delivery.to_address or "",
                            subject=delivery.subject,
                            text=delivery.body_text,
                            html=delivery.body_html,
                            reply_to=delivery.reply_to,
                        )
                    )
            except Exception as exc:  # noqa: BLE001 - any transport error is retried
                logger.warning("Delivery %s failed: %s", delivery.id, exc)
                _record_failure(delivery, exc, settings.delivery_max_attempts)
            else:
                _record_sent(db, delivery)
            db.commit()
        return len(batch)
