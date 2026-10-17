"""Venues: the places a couple are considering, with prices, contacts and notes.

Choosing a venue for an event (``Event.venue_id``) is what puts its name and address on the
invitations and into guests' calendar entries; see the properties on ``Event``.
"""

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.modules.weddings.models import Event, Venue, VenueContact, VenueStatus
from app.modules.weddings.schemas import (
    VenueContactIn,
    VenueCreate,
    VenueRead,
    VenueUpdate,
    VenueUse,
)
from app.modules.weddings.service import get_wedding

# Booked first, then the ones still in play, then the ones ruled out.
STATUS_ORDER = {
    VenueStatus.booked: 0,
    VenueStatus.shortlisted: 1,
    VenueStatus.considering: 2,
    VenueStatus.declined: 3,
}


def get_venue(db: Session, wedding_id: uuid.UUID, venue_id: uuid.UUID) -> Venue:
    venue = db.scalar(select(Venue).where(Venue.id == venue_id, Venue.wedding_id == wedding_id))
    if venue is None:
        raise NotFound("Venue not found")
    return venue


def _uses(db: Session, wedding_id: uuid.UUID) -> dict[uuid.UUID, list[VenueUse]]:
    uses: dict[uuid.UUID, list[VenueUse]] = defaultdict(list)
    events = db.scalars(
        select(Event)
        .where(Event.wedding_id == wedding_id, Event.venue_id.is_not(None))
        .order_by(Event.sort_order)
    )
    for event in events:
        uses[event.venue_id].append(VenueUse(event_id=event.id, event_name=event.name))
    return uses


def _read(venue: Venue, uses: dict[uuid.UUID, list[VenueUse]]) -> VenueRead:
    return VenueRead.model_validate(venue).model_copy(update={"used_for": uses.get(venue.id, [])})


def list_venues(db: Session, wedding_id: uuid.UUID) -> list[VenueRead]:
    get_wedding(db, wedding_id)
    venues = db.scalars(select(Venue).where(Venue.wedding_id == wedding_id)).all()
    uses = _uses(db, wedding_id)
    ordered = sorted(venues, key=lambda v: (STATUS_ORDER[v.status], v.name.lower()))
    return [_read(v, uses) for v in ordered]


def read_venue(db: Session, wedding_id: uuid.UUID, venue_id: uuid.UUID) -> VenueRead:
    return _read(get_venue(db, wedding_id, venue_id), _uses(db, wedding_id))


def _contacts(contacts: list[VenueContactIn]) -> list[VenueContact]:
    return [
        VenueContact(name=c.name, role=c.role, email=c.email, phone=c.phone, sort_order=i)
        for i, c in enumerate(contacts)
    ]


def create_venue(db: Session, wedding_id: uuid.UUID, data: VenueCreate) -> VenueRead:
    get_wedding(db, wedding_id)
    venue = Venue(wedding_id=wedding_id, **data.model_dump(exclude={"contacts"}))
    venue.contacts = _contacts(data.contacts)
    db.add(venue)
    db.commit()
    return read_venue(db, wedding_id, venue.id)


def update_venue(
    db: Session, wedding_id: uuid.UUID, venue_id: uuid.UUID, data: VenueUpdate
) -> VenueRead:
    venue = get_venue(db, wedding_id, venue_id)
    for field, value in data.model_dump(exclude_unset=True, exclude={"contacts"}).items():
        setattr(venue, field, value)
    if data.contacts is not None:
        venue.contacts = _contacts(data.contacts)
    db.commit()
    return read_venue(db, wedding_id, venue_id)


def delete_venue(db: Session, wedding_id: uuid.UUID, venue_id: uuid.UUID) -> None:
    """Remove a venue. Events that used it keep its name and address as typed-in text, so
    invitations already written around it do not lose their details."""
    venue = get_venue(db, wedding_id, venue_id)
    for event in db.scalars(select(Event).where(Event.venue_id == venue.id)):
        event.venue_id = None
        event.venue = None
        event.venue_name = venue.name
        event.venue_address = venue.address
    db.delete(venue)
    db.commit()
