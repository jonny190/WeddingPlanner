import uuid

from fastapi import APIRouter, status

from app.modules.tenancy.deps import DB, CurrentTenant, EditorTenant
from app.modules.weddings import service
from app.modules.weddings.schemas import (
    EventCreate,
    EventRead,
    EventUpdate,
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
