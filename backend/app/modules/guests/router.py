import uuid

from fastapi import APIRouter, Query, UploadFile, status
from fastapi.responses import Response

from app.core.errors import BadRequest
from app.modules.guests import service
from app.modules.guests.schemas import (
    BulkInvite,
    BulkResult,
    BulkUninvite,
    EventInvitationRead,
    GuestCreate,
    GuestRead,
    GuestUpdate,
    ImportResult,
    InvitationUpsert,
)
from app.modules.tenancy.deps import DB, CurrentTenant, EditorTenant

router = APIRouter(prefix="/weddings/{wedding_id}", tags=["Guests"])

MAX_IMPORT_BYTES = 2 * 1024 * 1024


@router.get("/guests", response_model=list[GuestRead])
def list_guests(
    wedding_id: uuid.UUID,
    db: DB,
    _ctx: CurrentTenant,
    search: str | None = None,
    group: str | None = None,
    event_id: uuid.UUID | None = Query(default=None, description="Only guests invited to this"),
):
    return service.list_guests(db, wedding_id, search=search, group_name=group, event_id=event_id)


@router.post("/guests", response_model=GuestRead, status_code=status.HTTP_201_CREATED)
def create_guest(wedding_id: uuid.UUID, data: GuestCreate, db: DB, _ctx: EditorTenant):
    return service.create_guest(db, wedding_id, data)


@router.post("/guests/import", response_model=ImportResult)
async def import_guests(wedding_id: uuid.UUID, file: UploadFile, db: DB, _ctx: EditorTenant):
    raw = await file.read(MAX_IMPORT_BYTES + 1)
    if len(raw) > MAX_IMPORT_BYTES:
        raise BadRequest("CSV files must be smaller than 2 MB")
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        content = raw.decode("latin-1")
    return service.import_guests_csv(db, wedding_id, content)


@router.get("/guests/export", response_class=Response)
def export_guests(wedding_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    return Response(
        content=service.export_guests_csv(db, wedding_id),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="guests.csv"'},
    )


@router.get("/guests/{guest_id}", response_model=GuestRead)
def get_guest(wedding_id: uuid.UUID, guest_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    return service.get_guest(db, wedding_id, guest_id)


@router.patch("/guests/{guest_id}", response_model=GuestRead)
def update_guest(
    wedding_id: uuid.UUID, guest_id: uuid.UUID, data: GuestUpdate, db: DB, _ctx: EditorTenant
):
    return service.update_guest(db, wedding_id, guest_id, data)


@router.delete("/guests/{guest_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_guest(wedding_id: uuid.UUID, guest_id: uuid.UUID, db: DB, _ctx: EditorTenant):
    service.delete_guest(db, wedding_id, guest_id)


@router.put("/guests/{guest_id}/invitations/{event_id}", response_model=EventInvitationRead)
def invite_guest(
    wedding_id: uuid.UUID,
    guest_id: uuid.UUID,
    event_id: uuid.UUID,
    data: InvitationUpsert,
    db: DB,
    _ctx: EditorTenant,
):
    """Invite a guest to an event (or change their plus-one allowance for it)."""
    return service.set_invitation(db, wedding_id, guest_id, event_id, data.plus_one_allowed)


@router.delete("/guests/{guest_id}/invitations/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def uninvite_guest(
    wedding_id: uuid.UUID, guest_id: uuid.UUID, event_id: uuid.UUID, db: DB, _ctx: EditorTenant
):
    service.remove_invitation(db, wedding_id, guest_id, event_id)


@router.post("/events/{event_id}/invitations/bulk", response_model=BulkResult)
def bulk_invite(
    wedding_id: uuid.UUID, event_id: uuid.UUID, data: BulkInvite, db: DB, _ctx: EditorTenant
):
    affected = service.bulk_invite(db, wedding_id, event_id, data.guest_ids, data.plus_one_allowed)
    return BulkResult(affected=affected)


@router.post("/events/{event_id}/invitations/bulk-remove", response_model=BulkResult)
def bulk_uninvite(
    wedding_id: uuid.UUID, event_id: uuid.UUID, data: BulkUninvite, db: DB, _ctx: EditorTenant
):
    return BulkResult(affected=service.bulk_uninvite(db, wedding_id, event_id, data.guest_ids))
