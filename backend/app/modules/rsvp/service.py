import uuid
from datetime import datetime
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.csv_export import to_csv
from app.core.db import bind_tenant, utcnow
from app.core.errors import BadRequest, NotFound
from app.modules.guests.models import (
    AgeGroup,
    EventInvitation,
    Guest,
    ResponseChannel,
    RsvpStatus,
)
from app.modules.guests.service import get_invitation
from app.modules.invitations.design import fonts_for
from app.modules.invitations.service import (
    card_designs,
    guest_values,
    personalised_card,
    rsvp_url,
)
from app.modules.menus import service as menus
from app.modules.menus.schemas import MenuChoiceSets, MenuCourseRead
from app.modules.rsvp.calendar import (
    CalendarEntry,
    build_ics,
    entry_for,
    filename_for,
    google_url,
    ics_url,
    outlook_url,
)
from app.modules.rsvp.schemas import (
    DietaryNote,
    Engagement,
    EventReplySummary,
    ReplyRow,
    ReplyUpdate,
    RsvpEvent,
    RsvpEventCalendar,
    RsvpSubmit,
    RsvpView,
    WeddingSummary,
)
from app.modules.weddings.models import Event, Wedding
from app.modules.weddings.service import get_event, get_wedding

# --- Guest-facing RSVP --------------------------------------------------------------------


def _guest_for_token(db: Session, token: str) -> Guest:
    guest = db.scalar(
        select(Guest)
        .where(Guest.rsvp_token == token)
        .options(selectinload(Guest.invitations).selectinload(EventInvitation.event))
    )
    if guest is None:
        raise NotFound("This invitation link is not valid", code="invalid_rsvp_link")
    # The token identifies the tenant; scope the rest of the request to it.
    bind_tenant(db, guest.tenant_id)
    return guest


def _visible_invitations(guest: Guest) -> list[EventInvitation]:
    """Only invitations that have actually been sent are shown to the guest."""
    sent = [i for i in guest.invitations if i.first_sent_at is not None]
    return sorted(sent, key=lambda i: (i.event.sort_order, i.event.name))


def _apply_plus_one(
    invitation: EventInvitation,
    attending: bool,
    plus_one_attending: bool | None,
    name: str | None,
    dietary: str | None,
) -> None:
    if not attending or not invitation.plus_one_allowed:
        invitation.clear_plus_one()
        return
    invitation.plus_one_attending = plus_one_attending
    invitation.plus_one_name = name if plus_one_attending else None
    invitation.plus_one_dietary = dietary if plus_one_attending else None


def rsvp_view(db: Session, token: str, public_app_url: str) -> RsvpView:
    guest = _guest_for_token(db, token)
    wedding = db.get(Wedding, guest.wedding_id)
    invitations = _visible_invitations(guest)
    message = next((i.guest_message for i in invitations if i.guest_message), None)
    designs = card_designs(db, invitations)
    cards = {
        i.id: personalised_card(
            designs[i.id],
            guest_values(
                guest=guest,
                wedding=wedding,
                event=i.event,
                plus_one_allowed=i.plus_one_allowed,
                link=rsvp_url(public_app_url, guest),
            ),
        )
        for i in invitations
    }
    fonts = set().union(*(d.font_families() for d in designs.values())) if designs else set()
    courses = menus.courses_for_events(db, {i.event_id for i in invitations})
    choices = menus.choices_for_invitations(db, [i.id for i in invitations])
    return RsvpView(
        first_name=guest.first_name,
        full_name=guest.full_name,
        couple_names=wedding.couple_names,
        wedding_title=wedding.title,
        wedding_date=wedding.wedding_date,
        dietary_requirements=guest.dietary_requirements,
        message=message,
        has_responded=any(i.responded_at for i in invitations),
        events=[
            RsvpEvent(
                event_id=i.event_id,
                name=i.event.name,
                kind=i.event.kind,
                starts_at=i.event.starts_at,
                ends_at=i.event.ends_at,
                venue_name=i.event.venue_name,
                venue_address=i.event.venue_address,
                details=i.event.details,
                rsvp_deadline=i.event.rsvp_deadline,
                plus_one_allowed=i.plus_one_allowed,
                rsvp_status=i.rsvp_status,
                plus_one_attending=i.plus_one_attending,
                plus_one_name=i.plus_one_name,
                plus_one_dietary=i.plus_one_dietary,
                card=cards[i.id],
                calendar=_calendar_links(i, wedding, guest, public_app_url),
                menu=[MenuCourseRead.model_validate(c) for c in courses.get(i.event_id, [])],
                menu_choices=choices.get(i.id, MenuChoiceSets()),
            )
            for i in invitations
        ],
        fonts=fonts_for(fonts),
    )


def _calendar_entry(
    invitation: EventInvitation, wedding: Wedding, guest: Guest, public_app_url: str
) -> CalendarEntry | None:
    """The calendar entry for one of this guest's invitations, if it has a date to build from."""
    return entry_for(invitation.event, wedding, detail_url=rsvp_url(public_app_url, guest))


def _calendar_links(
    invitation: EventInvitation, wedding: Wedding, guest: Guest, public_app_url: str
) -> RsvpEventCalendar | None:
    """How this guest can put the event into their own calendar."""
    entry = _calendar_entry(invitation, wedding, guest, public_app_url)
    if entry is None:
        return None
    return RsvpEventCalendar(
        ics_url=ics_url(public_app_url, guest.rsvp_token, invitation.event_id),
        google_url=google_url(entry),
        outlook_url=outlook_url(entry),
    )


class CalendarDownload(NamedTuple):
    """A calendar file ready to send: what to call it, and its contents."""

    filename: str
    content: str


def calendar_file(
    db: Session,
    token: str,
    public_app_url: str,
    event_id: uuid.UUID | None = None,
    *,
    now: datetime | None = None,
) -> CalendarDownload:
    """One guest's events as a calendar file, with the reminders.

    A single event can be asked for by id, which is what the button on that invitation does;
    without one the file holds everything the guest is invited to and has not declined.
    """
    guest = _guest_for_token(db, token)
    wedding = db.get(Wedding, guest.wedding_id)
    invitations = _visible_invitations(guest)
    event = None
    if event_id is not None:
        match = next((i for i in invitations if i.event_id == event_id), None)
        if match is None:
            raise NotFound("That event is not on your invitation")
        invitations, event = [match], match.event
    entries = [
        entry
        for entry in (
            _calendar_entry(i, wedding, guest, public_app_url)
            for i in invitations
            if i.rsvp_status is not RsvpStatus.declined
        )
        if entry is not None
    ]
    if not entries:
        raise NotFound("There is nothing to add to your calendar yet")
    return CalendarDownload(
        filename=filename_for(entries, event), content=build_ics(entries, stamp=now or utcnow())
    )


def submit_rsvp(db: Session, token: str, data: RsvpSubmit, public_app_url: str) -> RsvpView:
    guest = _guest_for_token(db, token)
    invitations = {i.event_id: i for i in _visible_invitations(guest)}
    courses = menus.courses_for_events(db, invitations.keys())
    now = utcnow()
    for response in data.responses:
        invitation = invitations.get(response.event_id)
        if invitation is None:
            raise BadRequest("You have not been invited to one of these events")
        if response.attending and response.plus_one_attending and not invitation.plus_one_allowed:
            raise BadRequest(f"Your invitation to {invitation.event.name} is just for you")
        invitation.rsvp_status = RsvpStatus.attending if response.attending else RsvpStatus.declined
        _apply_plus_one(
            invitation,
            response.attending,
            response.plus_one_attending,
            response.plus_one_name,
            response.plus_one_dietary,
        )
        invitation.guest_message = data.message
        invitation.responded_at = now
        invitation.response_channel = ResponseChannel.online
        # What they are having, now that we know whether they (and a plus-one) are coming.
        menus.set_choices(
            db,
            invitation,
            courses.get(invitation.event_id, []),
            response.menu_choices or MenuChoiceSets(),
            require_complete=True,
        )
    if data.dietary_requirements is not None:
        guest.dietary_requirements = data.dietary_requirements or None
    db.commit()
    return rsvp_view(db, token, public_app_url)


# --- Host-facing replies ------------------------------------------------------------------


def engagement(invitation: EventInvitation) -> Engagement:
    if invitation.rsvp_status != RsvpStatus.pending:
        return Engagement.responded
    if invitation.first_clicked_at:
        return Engagement.opened
    if invitation.first_sent_at:
        return Engagement.sent
    return Engagement.not_sent


def _reply_row(invitation: EventInvitation) -> ReplyRow:
    guest = invitation.guest
    return ReplyRow(
        guest_id=guest.id,
        invitation_id=invitation.id,
        full_name=guest.full_name,
        email=guest.email,
        group_name=guest.group_name,
        age_group=guest.age_group,
        rsvp_token=guest.rsvp_token,
        plus_one_allowed=invitation.plus_one_allowed,
        rsvp_status=invitation.rsvp_status,
        plus_one_attending=invitation.plus_one_attending,
        plus_one_name=invitation.plus_one_name,
        plus_one_dietary=invitation.plus_one_dietary,
        dietary_requirements=guest.dietary_requirements,
        guest_message=invitation.guest_message,
        responded_at=invitation.responded_at,
        response_channel=invitation.response_channel,
        first_sent_at=invitation.first_sent_at,
        last_sent_at=invitation.last_sent_at,
        first_clicked_at=invitation.first_clicked_at,
        last_clicked_at=invitation.last_clicked_at,
        click_count=invitation.click_count,
        engagement=engagement(invitation),
    )


def _event_invitations(db: Session, event_id: uuid.UUID) -> list[EventInvitation]:
    invitations = db.scalars(
        select(EventInvitation)
        .where(EventInvitation.event_id == event_id)
        .options(selectinload(EventInvitation.guest))
    )
    return sorted(
        invitations, key=lambda i: (i.guest.last_name.lower(), i.guest.first_name.lower())
    )


def list_replies(
    db: Session,
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    status: RsvpStatus | None = None,
    engagement_filter: Engagement | None = None,
) -> list[ReplyRow]:
    get_event(db, wedding_id, event_id)
    rows = [_reply_row(i) for i in _event_invitations(db, event_id)]
    return [
        r
        for r in rows
        if (status is None or r.rsvp_status == status)
        and (engagement_filter is None or r.engagement == engagement_filter)
    ]


def _summarise(event: Event, invitations: list[EventInvitation]) -> EventReplySummary:
    attending = [i for i in invitations if i.rsvp_status == RsvpStatus.attending]
    plus_ones_attending = sum(1 for i in attending if i.plus_one_allowed and i.plus_one_attending)
    dietary: list[DietaryNote] = []
    for i in attending:
        if i.guest.dietary_requirements:
            dietary.append(
                DietaryNote(name=i.guest.full_name, requirements=i.guest.dietary_requirements)
            )
        if i.plus_one_attending and i.plus_one_dietary:
            label = i.plus_one_name or f"{i.guest.full_name}'s guest"
            dietary.append(DietaryNote(name=label, requirements=i.plus_one_dietary))
    return EventReplySummary(
        event_id=event.id,
        event_name=event.name,
        kind=event.kind,
        invited=len(invitations),
        invites_sent=sum(1 for i in invitations if i.first_sent_at),
        invites_not_sent=sum(1 for i in invitations if not i.first_sent_at),
        opened=sum(1 for i in invitations if i.first_clicked_at),
        opened_no_reply=sum(1 for i in invitations if engagement(i) == Engagement.opened),
        attending=len(attending),
        declined=sum(1 for i in invitations if i.rsvp_status == RsvpStatus.declined),
        pending=sum(1 for i in invitations if i.rsvp_status == RsvpStatus.pending),
        plus_ones_allowed=sum(1 for i in invitations if i.plus_one_allowed),
        plus_ones_attending=plus_ones_attending,
        confirmed_headcount=len(attending) + plus_ones_attending,
        potential_headcount=sum(i.party_size for i in invitations),
        children_attending=sum(1 for i in attending if i.guest.age_group != AgeGroup.adult),
        dietary=dietary,
    )


def event_summary(db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID) -> EventReplySummary:
    event = get_event(db, wedding_id, event_id)
    return _summarise(event, _event_invitations(db, event_id))


def wedding_summary(db: Session, wedding_id: uuid.UUID) -> WeddingSummary:
    wedding = get_wedding(db, wedding_id)
    guests = db.scalars(select(Guest).where(Guest.wedding_id == wedding_id)).all()
    return WeddingSummary(
        wedding_id=wedding.id,
        guests_total=len(guests),
        guests_without_email=sum(1 for g in guests if not g.email),
        events=[_summarise(e, _event_invitations(db, e.id)) for e in wedding.events],
    )


def record_reply(
    db: Session,
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    guest_id: uuid.UUID,
    data: ReplyUpdate,
) -> ReplyRow:
    invitation = get_invitation(db, wedding_id, event_id, guest_id)
    if data.plus_one_attending and not invitation.plus_one_allowed:
        raise BadRequest("This guest's invitation does not include a plus-one")
    invitation.rsvp_status = data.rsvp_status
    if data.rsvp_status != RsvpStatus.attending:
        menus.clear_choices(db, invitation)
    if data.rsvp_status == RsvpStatus.pending:
        invitation.clear_plus_one()
        invitation.responded_at = None
        invitation.response_channel = None
    else:
        _apply_plus_one(
            invitation,
            data.rsvp_status == RsvpStatus.attending,
            data.plus_one_attending,
            data.plus_one_name,
            data.plus_one_dietary,
        )
        invitation.responded_at = utcnow()
        invitation.response_channel = ResponseChannel.manual
    if "guest_message" in data.model_fields_set:
        invitation.guest_message = data.guest_message
    if "dietary_requirements" in data.model_fields_set:
        invitation.guest.dietary_requirements = data.dietary_requirements
    db.commit()
    return _reply_row(invitation)


def export_replies_csv(db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID) -> str:
    header = [
        "name", "email", "group", "age_group", "rsvp", "plus_one_allowed",
        "plus_one_attending", "plus_one_name", "dietary_requirements", "plus_one_dietary",
        "message", "responded_at", "invite_sent_at", "link_opened_at", "link_opens",
    ]  # fmt: skip

    def when(value: datetime | None) -> str:
        return value.isoformat() if value else ""

    def yes_no(value: bool | None) -> str:
        return "" if value is None else ("yes" if value else "no")

    rows = (
        [
            r.full_name,
            r.email or "",
            r.group_name or "",
            r.age_group.value,
            r.rsvp_status.value,
            yes_no(r.plus_one_allowed),
            yes_no(r.plus_one_attending),
            r.plus_one_name or "",
            r.dietary_requirements or "",
            r.plus_one_dietary or "",
            r.guest_message or "",
            when(r.responded_at),
            when(r.first_sent_at),
            when(r.first_clicked_at),
            r.click_count,
        ]  # fmt: skip
        for r in list_replies(db, wedding_id, event_id)
    )
    return to_csv(header, rows)
