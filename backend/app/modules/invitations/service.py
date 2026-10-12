import secrets
import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.db import as_utc, bind_tenant, utcnow
from app.core.errors import BadRequest, NotFound
from app.modules.guests.models import EventInvitation, Guest, RsvpStatus
from app.modules.guests.service import get_guest
from app.modules.invitations.design import (
    InvitationDesign,
    default_design,
    fonts_for,
    personalise,
)
from app.modules.invitations.models import (
    DeliveryChannel,
    DeliveryStatus,
    DraftStatus,
    InvitationDelivery,
    InvitationDraft,
    InvitationLinkClick,
)
from app.modules.invitations.rendering import (
    RenderedInvitation,
    build_values,
    default_draft,
    fill_placeholders,
    render_invitation,
)
from app.modules.invitations.schemas import (
    Audience,
    DeliveryRead,
    DraftCreate,
    DraftUpdate,
    LinkOpenResult,
    PreviewRequest,
    PreviewResponse,
    Recipient,
    SendRequest,
    SendResult,
)
from app.modules.media.schemas import media_path
from app.modules.media.service import require_assets
from app.modules.weddings.models import Event, Wedding
from app.modules.weddings.service import get_event, get_wedding

ACTIVE_STATUSES = (DeliveryStatus.queued, DeliveryStatus.sending)
# Repeat opens of the same link within this window count once (refreshes, double clicks).
CLICK_DEBOUNCE = timedelta(seconds=30)


def rsvp_url(public_app_url: str, guest: Guest) -> str:
    return f"{public_app_url.rstrip('/')}/rsvp/{guest.rsvp_token}"


def tracked_url(public_app_url: str, tracking_token: str) -> str:
    return f"{public_app_url.rstrip('/')}/i/{tracking_token}"


def media_url(public_app_url: str, asset_id: uuid.UUID) -> str:
    return f"{public_app_url.rstrip('/')}{media_path(asset_id)}"


# --- Drafts ---------------------------------------------------------------------------------


def get_draft(
    db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID, draft_id: uuid.UUID
) -> InvitationDraft:
    draft = db.scalar(
        select(InvitationDraft).where(
            InvitationDraft.id == draft_id,
            InvitationDraft.event_id == event_id,
            InvitationDraft.wedding_id == wedding_id,
        )
    )
    if draft is None:
        raise NotFound("Invitation draft not found")
    return draft


def draft_design(draft: InvitationDraft, event: Event) -> InvitationDesign:
    if draft.design:
        return InvitationDesign.model_validate(draft.design)
    return default_design(event)


def _stored_design(db: Session, wedding_id: uuid.UUID, design: InvitationDesign) -> dict:
    require_assets(db, wedding_id, design.asset_ids())
    return design.model_dump(mode="json")


def list_drafts(db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID) -> list[InvitationDraft]:
    get_event(db, wedding_id, event_id)
    return list(
        db.scalars(
            select(InvitationDraft)
            .where(InvitationDraft.event_id == event_id)
            .order_by(InvitationDraft.created_at)
        )
    )


def create_draft(
    db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID, data: DraftCreate
) -> InvitationDraft:
    event = get_event(db, wedding_id, event_id)
    subject, body = default_draft(event)
    design = default_design(event)
    if data.copy_from_draft_id:
        source = db.scalar(
            select(InvitationDraft).where(
                InvitationDraft.id == data.copy_from_draft_id,
                InvitationDraft.wedding_id == wedding_id,
            )
        )
        if source is None:
            raise NotFound("The draft to copy was not found")
        subject, body = source.subject, source.body
        design = draft_design(source, event)
    draft = InvitationDraft(
        wedding_id=wedding_id,
        event_id=event_id,
        name=data.name,
        subject=data.subject or subject,
        body=data.body or body,
        design=_stored_design(db, wedding_id, data.design or design),
    )
    db.add(draft)
    db.commit()
    return draft


def update_draft(
    db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID, draft_id: uuid.UUID, data: DraftUpdate
) -> InvitationDraft:
    draft = get_draft(db, wedding_id, event_id, draft_id)
    for field in ("name", "subject", "body"):
        value = getattr(data, field)
        if field in data.model_fields_set and value is not None:
            setattr(draft, field, value)
    if data.design is not None:
        draft.design = _stored_design(db, wedding_id, data.design)
    db.commit()
    return draft


def delete_draft(
    db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID, draft_id: uuid.UUID
) -> None:
    db.delete(get_draft(db, wedding_id, event_id, draft_id))
    db.commit()


# --- Rendering ------------------------------------------------------------------------------


def guest_values(
    *,
    guest: Guest,
    wedding: Wedding,
    event: Event,
    plus_one_allowed: bool,
    link: str,
) -> dict[str, str]:
    return build_values(
        first_name=guest.first_name,
        last_name=guest.last_name,
        wedding=wedding,
        event=event,
        plus_one_allowed=plus_one_allowed,
        rsvp_url=link,
    )


def _render_email(
    *,
    subject: str,
    body: str,
    design: InvitationDesign,
    values: dict[str, str],
    public_app_url: str,
) -> RenderedInvitation:
    header = design.email.header_asset_id
    return render_invitation(
        subject,
        body,
        values,
        style=design.email,
        header_image_url=media_url(public_app_url, header) if header else None,
    )


def personalised_card(design: InvitationDesign, values: dict[str, str]) -> InvitationDesign:
    return personalise(design, lambda text: fill_placeholders(text, values).strip())


def _example_guest() -> Guest:
    return Guest(first_name="Alex", last_name="Example", rsvp_token="example")


def preview_draft(
    db: Session,
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    draft_id: uuid.UUID,
    data: PreviewRequest,
    public_app_url: str,
) -> PreviewResponse:
    draft = get_draft(db, wedding_id, event_id, draft_id)
    wedding = get_wedding(db, wedding_id)
    event = get_event(db, wedding_id, event_id)
    plus_one = True
    if data.guest_id:
        guest = get_guest(db, wedding_id, data.guest_id)
        invitation = next((i for i in guest.invitations if i.event_id == event_id), None)
        plus_one = bool(invitation and invitation.plus_one_allowed)
    else:
        guest = _example_guest()
    design = data.design or draft_design(draft, event)
    values = guest_values(
        guest=guest,
        wedding=wedding,
        event=event,
        plus_one_allowed=plus_one,
        link=rsvp_url(public_app_url, guest),
    )
    rendered = _render_email(
        subject=data.subject if data.subject is not None else draft.subject,
        body=data.body if data.body is not None else draft.body,
        design=design,
        values=values,
        public_app_url=public_app_url,
    )
    return PreviewResponse(
        subject=rendered.subject,
        text=rendered.text,
        html=rendered.html,
        unknown_placeholders=rendered.unknown_placeholders,
        guest_name=guest.full_name,
        card=personalised_card(design, values),
        fonts=fonts_for(design.font_families()),
    )


# --- Sending --------------------------------------------------------------------------------


def _audience(db: Session, event_id: uuid.UUID, request: SendRequest) -> list[EventInvitation]:
    query = (
        select(EventInvitation)
        .where(EventInvitation.event_id == event_id)
        .options(selectinload(EventInvitation.guest))
    )
    pending = EventInvitation.rsvp_status == RsvpStatus.pending
    match request.audience:
        case Audience.selected:
            query = query.where(EventInvitation.guest_id.in_(request.guest_ids))
        case Audience.pending:
            query = query.where(pending)
        case Audience.opened_no_reply:
            query = query.where(pending, EventInvitation.first_clicked_at.is_not(None))
        case Audience.not_opened:
            query = query.where(
                pending,
                EventInvitation.first_sent_at.is_not(None),
                EventInvitation.first_clicked_at.is_(None),
            )
        case Audience.unsent:
            in_flight = select(InvitationDelivery.invitation_id).where(
                InvitationDelivery.event_id == event_id,
                InvitationDelivery.status.in_(ACTIVE_STATUSES),
                InvitationDelivery.invitation_id.is_not(None),
                InvitationDelivery.is_test.is_(False),
            )
            query = query.where(
                EventInvitation.first_sent_at.is_(None), EventInvitation.id.not_in(in_flight)
            )
    invitations = list(db.scalars(query))
    if request.audience == Audience.selected and len(invitations) != len(set(request.guest_ids)):
        raise BadRequest("Some of the selected guests are not invited to this event")
    return sorted(invitations, key=lambda i: (i.guest.last_name, i.guest.first_name))


def send_draft(
    db: Session,
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    draft_id: uuid.UUID,
    request: SendRequest,
    public_app_url: str,
) -> SendResult:
    """Queue personalised emails for the chosen guests; the worker delivers them."""
    draft = get_draft(db, wedding_id, event_id, draft_id)
    wedding = get_wedding(db, wedding_id)
    event = get_event(db, wedding_id, event_id)
    design = draft_design(draft, event)
    invitations = _audience(db, event_id, request)

    queued: list[Recipient] = []
    skipped: list[Recipient] = []
    for invitation in invitations:
        guest = invitation.guest
        recipient = Recipient(guest_id=guest.id, full_name=guest.full_name, email=guest.email)
        (queued if guest.email else skipped).append(recipient)
        if request.dry_run or not guest.email:
            continue
        token = secrets.token_urlsafe(24)
        values = guest_values(
            guest=guest,
            wedding=wedding,
            event=event,
            plus_one_allowed=invitation.plus_one_allowed,
            link=tracked_url(public_app_url, token),
        )
        rendered = _render_email(
            subject=draft.subject,
            body=draft.body,
            design=design,
            values=values,
            public_app_url=public_app_url,
        )
        db.add(
            InvitationDelivery(
                wedding_id=wedding_id,
                event_id=event_id,
                draft_id=draft.id,
                guest_id=guest.id,
                invitation_id=invitation.id,
                channel=DeliveryChannel.email,
                tracking_token=token,
                to_address=guest.email,
                reply_to=wedding.contact_email,
                subject=rendered.subject,
                body_text=rendered.text,
                body_html=rendered.html,
                status=DeliveryStatus.queued,
            )
        )

    if not request.dry_run and queued:
        draft.status = DraftStatus.sent
        draft.last_sent_at = utcnow()
        draft.sent_count += len(queued)
        db.commit()
    return SendResult(dry_run=request.dry_run, queued=queued, skipped_no_email=skipped)


def send_test(
    db: Session,
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    draft_id: uuid.UUID,
    email: str,
    guest_id: uuid.UUID | None,
    public_app_url: str,
) -> InvitationDelivery:
    """Email a preview to the couple. Its link is not tracked."""
    preview = preview_draft(
        db, wedding_id, event_id, draft_id, PreviewRequest(guest_id=guest_id), public_app_url
    )
    wedding = get_wedding(db, wedding_id)
    delivery = InvitationDelivery(
        wedding_id=wedding_id,
        event_id=event_id,
        draft_id=draft_id,
        channel=DeliveryChannel.email,
        is_test=True,
        to_address=email,
        reply_to=wedding.contact_email,
        subject=f"[Test] {preview.subject}",
        body_text=preview.text,
        body_html=preview.html,
        status=DeliveryStatus.queued,
    )
    db.add(delivery)
    db.commit()
    return delivery


def mark_sent(
    db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID, guest_ids: list[uuid.UUID]
) -> int:
    """Record invitations that were posted or handed over in person."""
    get_event(db, wedding_id, event_id)
    invitations = list(
        db.scalars(
            select(EventInvitation).where(
                EventInvitation.event_id == event_id, EventInvitation.guest_id.in_(guest_ids)
            )
        )
    )
    if len(invitations) != len(set(guest_ids)):
        raise BadRequest("Some of the selected guests are not invited to this event")
    now = utcnow()
    for invitation in invitations:
        invitation.first_sent_at = invitation.first_sent_at or now
        invitation.last_sent_at = now
        db.add(
            InvitationDelivery(
                wedding_id=wedding_id,
                event_id=event_id,
                guest_id=invitation.guest_id,
                invitation_id=invitation.id,
                channel=DeliveryChannel.manual,
                subject="Sent outside the app",
                body_text="",
                status=DeliveryStatus.sent,
                sent_at=now,
            )
        )
    db.commit()
    return len(invitations)


def list_deliveries(
    db: Session,
    wedding_id: uuid.UUID,
    *,
    event_id: uuid.UUID | None = None,
    status: DeliveryStatus | None = None,
    limit: int = 500,
) -> list[DeliveryRead]:
    get_wedding(db, wedding_id)
    query = select(InvitationDelivery).where(InvitationDelivery.wedding_id == wedding_id)
    if event_id:
        query = query.where(InvitationDelivery.event_id == event_id)
    if status:
        query = query.where(InvitationDelivery.status == status)
    deliveries = list(db.scalars(query.order_by(InvitationDelivery.created_at.desc()).limit(limit)))
    guest_ids = {d.guest_id for d in deliveries if d.guest_id}
    names = (
        {g.id: g.full_name for g in db.scalars(select(Guest).where(Guest.id.in_(guest_ids)))}
        if guest_ids
        else {}
    )
    return [
        DeliveryRead.model_validate(d).model_copy(update={"guest_name": names.get(d.guest_id)})
        for d in deliveries
    ]


def retry_failed(db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID) -> int:
    get_event(db, wedding_id, event_id)
    failed = db.scalars(
        select(InvitationDelivery).where(
            InvitationDelivery.event_id == event_id,
            InvitationDelivery.status == DeliveryStatus.failed,
        )
    ).all()
    for delivery in failed:
        delivery.status = DeliveryStatus.queued
        delivery.attempts = 0
        delivery.next_attempt_at = None
        delivery.error = None
    db.commit()
    return len(failed)


# --- Link tracking & cards for guests -----------------------------------------------------


def record_link_open(db: Session, token: str, user_agent: str | None) -> LinkOpenResult:
    """A guest opened the link in their invitation email: note it, then send them to RSVP."""
    delivery = db.scalar(
        select(InvitationDelivery).where(InvitationDelivery.tracking_token == token)
    )
    if delivery is None or delivery.guest_id is None:
        raise NotFound("This invitation link is not valid", code="invalid_rsvp_link")
    bind_tenant(db, delivery.tenant_id)
    guest = db.get(Guest, delivery.guest_id)
    invitation = db.get(EventInvitation, delivery.invitation_id) if delivery.invitation_id else None
    if guest is None:
        raise NotFound("This invitation link is not valid", code="invalid_rsvp_link")

    now = utcnow()
    recent = (
        invitation
        and invitation.last_clicked_at
        and (now - as_utc(invitation.last_clicked_at) < CLICK_DEBOUNCE)
    )
    if not recent:
        db.add(
            InvitationLinkClick(
                wedding_id=delivery.wedding_id,
                event_id=delivery.event_id,
                guest_id=guest.id,
                delivery_id=delivery.id,
                clicked_at=now,
                user_agent=(user_agent or "")[:400] or None,
            )
        )
        if invitation is not None:
            invitation.first_clicked_at = invitation.first_clicked_at or now
            invitation.last_clicked_at = now
            invitation.click_count += 1
            # The email evidently arrived, even if the worker has not recorded it yet.
            invitation.first_sent_at = invitation.first_sent_at or now
            invitation.last_sent_at = invitation.last_sent_at or now
        db.commit()
    return LinkOpenResult(rsvp_token=guest.rsvp_token, event_id=delivery.event_id)


def card_designs(
    db: Session, invitations: list[EventInvitation]
) -> dict[uuid.UUID, InvitationDesign]:
    """The card each guest should see: from the draft last emailed to them for that event,
    else the event's most recently sent draft, else any draft for the event, else a default."""
    if not invitations:
        return {}
    designs: dict[uuid.UUID, InvitationDesign] = {}
    rows = db.execute(
        select(InvitationDelivery.invitation_id, InvitationDraft.design)
        .join(InvitationDraft, InvitationDraft.id == InvitationDelivery.draft_id)
        .where(
            InvitationDelivery.invitation_id.in_([i.id for i in invitations]),
            InvitationDelivery.is_test.is_(False),
            InvitationDelivery.status != DeliveryStatus.skipped,
        )
        .order_by(InvitationDelivery.created_at.desc())
    )
    for invitation_id, design in rows:
        if invitation_id not in designs and design:
            designs[invitation_id] = InvitationDesign.model_validate(design)

    event_ids = {i.event_id for i in invitations if i.id not in designs}
    by_event: dict[uuid.UUID, InvitationDesign] = {}
    if event_ids:
        drafts = db.scalars(
            select(InvitationDraft)
            .where(InvitationDraft.event_id.in_(event_ids))
            .order_by(
                InvitationDraft.last_sent_at.desc().nulls_last(), InvitationDraft.updated_at.desc()
            )
        )
        for draft in drafts:
            if draft.event_id not in by_event and draft.design:
                by_event[draft.event_id] = InvitationDesign.model_validate(draft.design)
    for invitation in invitations:
        if invitation.id not in designs:
            designs[invitation.id] = by_event.get(invitation.event_id) or default_design(
                invitation.event
            )
    return designs
