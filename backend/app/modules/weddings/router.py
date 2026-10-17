import uuid

from fastapi import APIRouter, status

from app.modules.tenancy.deps import DB, CurrentTenant, EditorTenant
from app.modules.weddings import service, venues
from app.modules.weddings.schemas import (
    EventCreate,
    EventRead,
    EventUpdate,
    VenueCreate,
    VenueRead,
    VenueUpdate,
    WeddingCreate,
    WeddingRead,
    WeddingUpdate,
)

router = APIRouter(prefix="/weddings", tags=["Weddings & events"])


@router.get("", response_model=list[WeddingRead])
def list_weddings(db: DB, _ctx: CurrentTenant):
    return service.list_weddings(db)


@router.post("", response_model=WeddingRead, status_code=status.HTTP_201_CREATED)
def create_wedding(data: WeddingCreate, db: DB, _ctx: EditorTenant):
    return service.create_wedding(db, data)


@router.get("/{wedding_id}", response_model=WeddingRead)
def get_wedding(wedding_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    return service.get_wedding(db, wedding_id)


@router.patch("/{wedding_id}", response_model=WeddingRead)
def update_wedding(wedding_id: uuid.UUID, data: WeddingUpdate, db: DB, _ctx: EditorTenant):
    return service.update_wedding(db, wedding_id, data)


@router.delete("/{wedding_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wedding(wedding_id: uuid.UUID, db: DB, _ctx: EditorTenant):
    service.delete_wedding(db, wedding_id)


@router.get("/{wedding_id}/events", response_model=list[EventRead])
def list_events(wedding_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    return service.get_wedding(db, wedding_id).events


@router.post("/{wedding_id}/events", response_model=EventRead, status_code=status.HTTP_201_CREATED)
def create_event(wedding_id: uuid.UUID, data: EventCreate, db: DB, _ctx: EditorTenant):
    return service.create_event(db, wedding_id, data)


@router.patch("/{wedding_id}/events/{event_id}", response_model=EventRead)
def update_event(
    wedding_id: uuid.UUID, event_id: uuid.UUID, data: EventUpdate, db: DB, _ctx: EditorTenant
):
    return service.update_event(db, wedding_id, event_id, data)


@router.delete("/{wedding_id}/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(wedding_id: uuid.UUID, event_id: uuid.UUID, db: DB, _ctx: EditorTenant):
    service.delete_event(db, wedding_id, event_id)


# --- Venues: the places being considered, and the one chosen for each event -----------------


@router.get("/{wedding_id}/venues", response_model=list[VenueRead])
def list_venues(wedding_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    """Every venue on the list, booked first, with the events each one is chosen for."""
    return venues.list_venues(db, wedding_id)


@router.post("/{wedding_id}/venues", response_model=VenueRead, status_code=status.HTTP_201_CREATED)
def create_venue(wedding_id: uuid.UUID, data: VenueCreate, db: DB, _ctx: EditorTenant):
    return venues.create_venue(db, wedding_id, data)


@router.get("/{wedding_id}/venues/{venue_id}", response_model=VenueRead)
def get_venue(wedding_id: uuid.UUID, venue_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    return venues.read_venue(db, wedding_id, venue_id)


@router.patch("/{wedding_id}/venues/{venue_id}", response_model=VenueRead)
def update_venue(
    wedding_id: uuid.UUID, venue_id: uuid.UUID, data: VenueUpdate, db: DB, _ctx: EditorTenant
):
    """Change a venue's details. Sending contacts replaces the list."""
    return venues.update_venue(db, wedding_id, venue_id, data)


@router.delete("/{wedding_id}/venues/{venue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_venue(wedding_id: uuid.UUID, venue_id: uuid.UUID, db: DB, _ctx: EditorTenant):
    """Remove a venue. Events that used it keep its name and address as typed-in text."""
    venues.delete_venue(db, wedding_id, venue_id)
