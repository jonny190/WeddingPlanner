import uuid

from fastapi import APIRouter
from fastapi.responses import Response

from app.modules.menus import service
from app.modules.menus.schemas import (
    GuestChoiceRow,
    MenuChoiceSets,
    MenuChoicesReport,
    MenuCourseRead,
    MenuRead,
    MenuUpdate,
)
from app.modules.tenancy.deps import DB, CurrentTenant, EditorTenant

router = APIRouter(prefix="/weddings/{wedding_id}/events/{event_id}/menu", tags=["Menus"])


@router.get("", response_model=MenuRead)
def get_menu(wedding_id: uuid.UUID, event_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    """The event's courses and the dishes on offer for each."""
    courses = service.get_menu(db, wedding_id, event_id)
    return MenuRead(event_id=event_id, courses=[MenuCourseRead.model_validate(c) for c in courses])


@router.put("", response_model=MenuRead)
def replace_menu(
    wedding_id: uuid.UUID, event_id: uuid.UUID, data: MenuUpdate, db: DB, _ctx: EditorTenant
):
    """Save the whole menu. Send courses and dishes with their ids to keep guests' choices."""
    courses = service.replace_menu(db, wedding_id, event_id, data)
    return MenuRead(event_id=event_id, courses=[MenuCourseRead.model_validate(c) for c in courses])


@router.get("/choices", response_model=MenuChoicesReport)
def choices_report(wedding_id: uuid.UUID, event_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    """How many of each dish, who is having what, and who still has to choose."""
    return service.report(db, wedding_id, event_id)


@router.put("/choices/{guest_id}", response_model=GuestChoiceRow)
def record_choices(
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    guest_id: uuid.UUID,
    data: MenuChoiceSets,
    db: DB,
    _ctx: EditorTenant,
):
    """Write down a guest's (and their plus-one's) choices, e.g. from a phone call."""
    return service.record_choices(db, wedding_id, event_id, guest_id, data)


@router.get("/choices/export", response_class=Response)
def export_choices(wedding_id: uuid.UUID, event_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    return Response(
        content=service.export_choices_csv(db, wedding_id, event_id),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="menu-choices.csv"'},
    )
