import uuid
from datetime import datetime, time

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import NotFound
from app.modules.weddings.models import Event, EventKind, Venue, Wedding
from app.modules.weddings.schemas import EventCreate, EventUpdate, WeddingCreate, WeddingUpdate


def get_wedding(db: Session, wedding_id: uuid.UUID) -> Wedding:
    """Load a wedding belonging to the session's tenant, or raise 404."""
    wedding = db.scalar(
        select(Wedding).where(Wedding.id == wedding_id).options(selectinload(Wedding.events))
    )
    if wedding is None:
        raise NotFound("Wedding not found")
    return wedding


def get_event(db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID) -> Event:
    event = db.scalar(select(Event).where(Event.id == event_id, Event.wedding_id == wedding_id))
    if event is None:
        raise NotFound("Event not found")
    return event


def list_weddings(db: Session) -> list[Wedding]:
    return list(
        db.scalars(
            select(Wedding)
            .options(selectinload(Wedding.events))
            .order_by(Wedding.wedding_date.is_(None), Wedding.wedding_date, Wedding.created_at)
        )
    )


def _default_events(data: WeddingCreate) -> list[Event]:
    def at(hour: int) -> datetime | None:
        return datetime.combine(data.wedding_date, time(hour)) if data.wedding_date else None

    return [
        Event(kind=EventKind.day, name="Wedding Day", starts_at=at(13), sort_order=0),
        Event(kind=EventKind.evening, name="Evening Reception", starts_at=at(19), sort_order=1),
    ]


def create_wedding(db: Session, data: WeddingCreate) -> Wedding:
    wedding = Wedding(
        title=data.title or f"{data.partner_one_name} & {data.partner_two_name}",
        partner_one_name=data.partner_one_name,
        partner_two_name=data.partner_two_name,
        wedding_date=data.wedding_date,
        contact_email=data.contact_email,
        notes=data.notes,
    )
    if data.create_default_events:
        wedding.events = _default_events(data)
    db.add(wedding)
    db.commit()
    return get_wedding(db, wedding.id)


def update_wedding(db: Session, wedding_id: uuid.UUID, data: WeddingUpdate) -> Wedding:
    wedding = get_wedding(db, wedding_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(wedding, field, value)
    if not (wedding.title or "").strip():
        wedding.title = wedding.couple_names
    db.commit()
    return wedding


def delete_wedding(db: Session, wedding_id: uuid.UUID) -> None:
    db.delete(get_wedding(db, wedding_id))
    db.commit()


def _check_venue(db: Session, wedding_id: uuid.UUID, venue_id: uuid.UUID | None) -> None:
    """A venue chosen for an event must be one of this wedding's own."""
    if venue_id is None:
        return
    found = db.scalar(select(Venue.id).where(Venue.id == venue_id, Venue.wedding_id == wedding_id))
    if found is None:
        raise NotFound("Venue not found")


def create_event(db: Session, wedding_id: uuid.UUID, data: EventCreate) -> Event:
    get_wedding(db, wedding_id)
    _check_venue(db, wedding_id, data.venue_id)
    values = data.model_dump()
    if values["sort_order"] is None:
        current_max = db.scalar(
            select(func.max(Event.sort_order)).where(Event.wedding_id == wedding_id)
        )
        values["sort_order"] = (current_max if current_max is not None else -1) + 1
    event = Event(wedding_id=wedding_id, **values)
    db.add(event)
    db.commit()
    return event


def update_event(
    db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID, data: EventUpdate
) -> Event:
    event = get_event(db, wedding_id, event_id)
    fields = data.model_dump(exclude_unset=True)
    if "venue_id" in fields:
        _check_venue(db, wedding_id, fields["venue_id"])
    for field, value in fields.items():
        setattr(event, field, value)
    if "venue_id" in fields:
        # The joined venue is cached on the instance; reload so the properties see the change.
        db.flush()
        db.refresh(event)
    db.commit()
    return event


def delete_event(db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID) -> None:
    db.delete(get_event(db, wedding_id, event_id))
    db.commit()
