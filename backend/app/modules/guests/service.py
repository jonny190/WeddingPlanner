import csv
import io
import re
import uuid

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.csv_export import to_csv
from app.core.errors import BadRequest, NotFound
from app.modules.guests.models import AgeGroup, EventInvitation, Guest
from app.modules.guests.phones import normalise_phone
from app.modules.guests.schemas import (
    GuestCreate,
    GuestUpdate,
    ImportResult,
    ImportRowError,
    InvitationSpec,
)
from app.modules.weddings.models import Event
from app.modules.weddings.service import get_event, get_wedding

_email_adapter = TypeAdapter(EmailStr)
_TRUTHY = {"y", "yes", "true", "1", "x"}


def _guest_query():
    return select(Guest).options(selectinload(Guest.invitations))


def get_guest(db: Session, wedding_id: uuid.UUID, guest_id: uuid.UUID) -> Guest:
    guest = db.scalar(_guest_query().where(Guest.id == guest_id, Guest.wedding_id == wedding_id))
    if guest is None:
        raise NotFound("Guest not found")
    return guest


def list_guests(
    db: Session,
    wedding_id: uuid.UUID,
    *,
    search: str | None = None,
    group_name: str | None = None,
    event_id: uuid.UUID | None = None,
) -> list[Guest]:
    get_wedding(db, wedding_id)
    query = _guest_query().where(Guest.wedding_id == wedding_id)
    if search:
        like = f"%{search.strip()}%"
        query = query.where(
            or_(Guest.first_name.ilike(like), Guest.last_name.ilike(like), Guest.email.ilike(like))
        )
    if group_name:
        query = query.where(Guest.group_name == group_name)
    if event_id:
        query = query.where(
            Guest.id.in_(
                select(EventInvitation.guest_id).where(EventInvitation.event_id == event_id)
            )
        )
    return list(db.scalars(query.order_by(Guest.last_name, Guest.first_name)))


def _wedding_event_ids(db: Session, wedding_id: uuid.UUID) -> set[uuid.UUID]:
    return set(db.scalars(select(Event.id).where(Event.wedding_id == wedding_id)))


def _set_plus_one(invitation: EventInvitation, allowed: bool) -> None:
    invitation.plus_one_allowed = allowed
    if not allowed:
        invitation.clear_plus_one()


def _sync_invitations(guest: Guest, specs: list[InvitationSpec], event_ids: set[uuid.UUID]) -> None:
    wanted = {spec.event_id: spec for spec in specs}
    unknown = set(wanted) - event_ids
    if unknown:
        raise BadRequest("One or more events do not belong to this wedding")
    for invitation in list(guest.invitations):
        spec = wanted.pop(invitation.event_id, None)
        if spec is None:
            guest.invitations.remove(invitation)
        else:
            _set_plus_one(invitation, spec.plus_one_allowed)
    for spec in wanted.values():
        guest.invitations.append(
            EventInvitation(
                wedding_id=guest.wedding_id,
                event_id=spec.event_id,
                plus_one_allowed=spec.plus_one_allowed,
            )
        )


def create_guest(
    db: Session, wedding_id: uuid.UUID, data: GuestCreate, phone_region: str = "GB"
) -> Guest:
    get_wedding(db, wedding_id)
    guest = Guest(wedding_id=wedding_id, **data.model_dump(exclude={"invitations"}))
    guest.phone = normalise_phone(guest.phone, phone_region)
    db.add(guest)
    _sync_invitations(guest, data.invitations, _wedding_event_ids(db, wedding_id))
    db.commit()
    return get_guest(db, wedding_id, guest.id)


def update_guest(
    db: Session,
    wedding_id: uuid.UUID,
    guest_id: uuid.UUID,
    data: GuestUpdate,
    phone_region: str = "GB",
) -> Guest:
    guest = get_guest(db, wedding_id, guest_id)
    for field, value in data.model_dump(exclude_unset=True, exclude={"invitations"}).items():
        setattr(guest, field, normalise_phone(value, phone_region) if field == "phone" else value)
    if data.invitations is not None:
        _sync_invitations(guest, data.invitations, _wedding_event_ids(db, wedding_id))
    db.commit()
    return get_guest(db, wedding_id, guest_id)


def delete_guest(db: Session, wedding_id: uuid.UUID, guest_id: uuid.UUID) -> None:
    db.delete(get_guest(db, wedding_id, guest_id))
    db.commit()


def get_invitation(
    db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID, guest_id: uuid.UUID
) -> EventInvitation:
    invitation = db.scalar(
        select(EventInvitation).where(
            EventInvitation.wedding_id == wedding_id,
            EventInvitation.event_id == event_id,
            EventInvitation.guest_id == guest_id,
        )
    )
    if invitation is None:
        raise NotFound("This guest is not invited to that event")
    return invitation


def set_invitation(
    db: Session, wedding_id: uuid.UUID, guest_id: uuid.UUID, event_id: uuid.UUID, plus_one: bool
) -> EventInvitation:
    guest = get_guest(db, wedding_id, guest_id)
    get_event(db, wedding_id, event_id)
    invitation = next((i for i in guest.invitations if i.event_id == event_id), None)
    if invitation is None:
        invitation = EventInvitation(wedding_id=wedding_id, event_id=event_id)
        guest.invitations.append(invitation)
    _set_plus_one(invitation, plus_one)
    db.commit()
    return invitation


def remove_invitation(
    db: Session, wedding_id: uuid.UUID, guest_id: uuid.UUID, event_id: uuid.UUID
) -> None:
    db.delete(get_invitation(db, wedding_id, event_id, guest_id))
    db.commit()


def _guests_by_id(db: Session, wedding_id: uuid.UUID, guest_ids: list[uuid.UUID]) -> list[Guest]:
    guests = list(
        db.scalars(_guest_query().where(Guest.wedding_id == wedding_id, Guest.id.in_(guest_ids)))
    )
    if len(guests) != len(set(guest_ids)):
        raise NotFound("One or more guests were not found")
    return guests


def bulk_invite(
    db: Session,
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    guest_ids: list[uuid.UUID],
    plus_one: bool | None,
) -> int:
    get_event(db, wedding_id, event_id)
    for guest in _guests_by_id(db, wedding_id, guest_ids):
        invitation = next((i for i in guest.invitations if i.event_id == event_id), None)
        if invitation is None:
            invitation = EventInvitation(wedding_id=wedding_id, event_id=event_id)
            guest.invitations.append(invitation)
            _set_plus_one(invitation, bool(plus_one))
        elif plus_one is not None:
            _set_plus_one(invitation, plus_one)
    db.commit()
    return len(guest_ids)


def bulk_uninvite(
    db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID, guest_ids: list[uuid.UUID]
) -> int:
    get_event(db, wedding_id, event_id)
    invitations = db.scalars(
        select(EventInvitation).where(
            EventInvitation.event_id == event_id, EventInvitation.guest_id.in_(guest_ids)
        )
    ).all()
    for invitation in invitations:
        db.delete(invitation)
    db.commit()
    return len(invitations)


# --- CSV import / export -------------------------------------------------------------------


def _column_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def _event_column_keys(events: list[Event]) -> dict[str, Event]:
    """Columns that toggle an invitation: the event kind ("day", "evening") or its name."""
    keys: dict[str, Event] = {}
    for event in events:
        keys.setdefault(event.kind.value, event)
        keys.setdefault(_column_key(event.name), event)
    return keys


def _primary_event_key(event: Event, events: list[Event]) -> str:
    first_of_kind = next(e for e in events if e.kind == event.kind)
    return event.kind.value if first_of_kind.id == event.id else _column_key(event.name)


def import_guests_csv(
    db: Session, wedding_id: uuid.UUID, content: str, phone_region: str = "GB"
) -> ImportResult:
    """Import guests from a spreadsheet export.

    Recognised columns: first_name, last_name (or a single "name"), email, phone, group,
    age_group, dietary_requirements, notes; plus one column per event (e.g. "day",
    "evening") and "<event>_plus_one", using yes/no values.
    """
    wedding = get_wedding(db, wedding_id)
    event_columns = _event_column_keys(wedding.events)
    reader = csv.DictReader(io.StringIO(content.lstrip("\ufeff")))
    if not reader.fieldnames:
        raise BadRequest("The CSV file is empty")
    reader.fieldnames = [_column_key(name) for name in reader.fieldnames]

    created, errors = 0, []
    for row_number, raw in enumerate(reader, start=2):
        row = {k: (v or "").strip() for k, v in raw.items() if k}
        first, last = row.get("first_name", ""), row.get("last_name", "")
        if not first and row.get("name"):
            first, _, last = row["name"].partition(" ")
        if not first:
            errors.append(ImportRowError(row=row_number, message="Missing first name"))
            continue
        email = row.get("email") or None
        if email:
            try:
                email = _email_adapter.validate_python(email)
            except ValidationError:
                errors.append(ImportRowError(row=row_number, message=f"Invalid email '{email}'"))
                continue
        age = row.get("age_group", "").lower() or AgeGroup.adult.value
        if age not in AgeGroup.__members__:
            errors.append(ImportRowError(row=row_number, message=f"Unknown age group '{age}'"))
            continue
        try:
            phone = normalise_phone(row.get("phone") or row.get("mobile") or None, phone_region)
        except BadRequest as exc:
            errors.append(ImportRowError(row=row_number, message=exc.message))
            continue

        guest = Guest(
            wedding_id=wedding_id,
            first_name=first[:100],
            last_name=last.strip()[:100],
            email=email,
            phone=phone,
            group_name=row.get("group") or row.get("group_name") or None,
            age_group=AgeGroup(age),
            dietary_requirements=row.get("dietary_requirements") or row.get("dietary") or None,
            notes=row.get("notes") or None,
        )
        invited_events: dict[uuid.UUID, bool] = {}
        for key, event in event_columns.items():
            if row.get(key, "").lower() in _TRUTHY:
                plus_one = row.get(f"{key}_plus_one", "").lower() in _TRUTHY
                invited_events[event.id] = invited_events.get(event.id, False) or plus_one
        for event_id, plus_one in invited_events.items():
            guest.invitations.append(
                EventInvitation(wedding_id=wedding_id, event_id=event_id, plus_one_allowed=plus_one)
            )
        db.add(guest)
        created += 1
    db.commit()
    return ImportResult(created=created, errors=errors)


def export_guests_csv(db: Session, wedding_id: uuid.UUID) -> str:
    wedding = get_wedding(db, wedding_id)
    events = wedding.events
    event_keys = [(_primary_event_key(e, events), e) for e in events]
    header = [
        "first_name",
        "last_name",
        "email",
        "phone",
        "group",
        "age_group",
        "dietary_requirements",
        "notes",
    ]
    for key, _ in event_keys:
        header += [key, f"{key}_plus_one", f"{key}_rsvp", f"{key}_plus_one_name"]

    rows = []
    for guest in list_guests(db, wedding_id):
        by_event = {i.event_id: i for i in guest.invitations}
        row = [
            guest.first_name,
            guest.last_name,
            guest.email or "",
            guest.phone or "",
            guest.group_name or "",
            guest.age_group.value,
            guest.dietary_requirements or "",
            guest.notes or "",
        ]
        for _, event in event_keys:
            inv = by_event.get(event.id)
            row += (
                [
                    "yes",
                    "yes" if inv.plus_one_allowed else "no",
                    inv.rsvp_status.value,
                    inv.plus_one_name or "",
                ]
                if inv
                else ["no", "no", "", ""]
            )
        rows.append(row)
    return to_csv(header, rows)
