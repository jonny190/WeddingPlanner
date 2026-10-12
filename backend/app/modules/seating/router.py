import uuid

from fastapi import APIRouter, status

from app.modules.seating import service
from app.modules.seating.schemas import (
    AssignmentUpdate,
    AutoArrangeRequest,
    AutoArrangeResult,
    ConstraintCreate,
    ConstraintRead,
    SeatingPlan,
    TableCreate,
    TableRead,
    TablesBulkCreate,
    TableUpdate,
)
from app.modules.tenancy.deps import DB, CurrentTenant, EditorTenant

router = APIRouter(prefix="/weddings/{wedding_id}", tags=["Seating"])
event_seating = "/events/{event_id}/seating"


@router.get(event_seating, response_model=SeatingPlan)
def get_plan(wedding_id: uuid.UUID, event_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    """The room layout, who sits where, who still needs a seat, and any rule breaches."""
    return service.get_plan(db, wedding_id, event_id)


@router.post(
    f"{event_seating}/tables", response_model=TableRead, status_code=status.HTTP_201_CREATED
)
def create_table(
    wedding_id: uuid.UUID, event_id: uuid.UUID, data: TableCreate, db: DB, _ctx: EditorTenant
):
    return service.create_table(db, wedding_id, event_id, data)


@router.post(
    f"{event_seating}/tables/bulk",
    response_model=list[TableRead],
    status_code=status.HTTP_201_CREATED,
)
def bulk_create_tables(
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    data: TablesBulkCreate,
    db: DB,
    _ctx: EditorTenant,
):
    """Set up the room in one go, e.g. 12 round tables of 10."""
    return service.bulk_create_tables(db, wedding_id, event_id, data)


@router.patch(f"{event_seating}/tables/{{table_id}}", response_model=TableRead)
def update_table(
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    table_id: uuid.UUID,
    data: TableUpdate,
    db: DB,
    _ctx: EditorTenant,
):
    return service.update_table(db, wedding_id, event_id, table_id, data)


@router.delete(f"{event_seating}/tables/{{table_id}}", status_code=status.HTTP_204_NO_CONTENT)
def delete_table(
    wedding_id: uuid.UUID, event_id: uuid.UUID, table_id: uuid.UUID, db: DB, _ctx: EditorTenant
):
    service.delete_table(db, wedding_id, event_id, table_id)


@router.put(f"{event_seating}/assignments/{{guest_id}}", response_model=SeatingPlan)
def assign_guest(
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    guest_id: uuid.UUID,
    data: AssignmentUpdate,
    db: DB,
    _ctx: EditorTenant,
):
    """Move a guest (with their plus-one) to a table, or off all tables with table_id=null."""
    return service.assign_guest(db, wedding_id, event_id, guest_id, data.table_id, data.locked)


@router.delete(f"{event_seating}/assignments", response_model=SeatingPlan)
def clear_assignments(
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    db: DB,
    _ctx: EditorTenant,
    keep_locked: bool = True,
):
    return service.clear_assignments(db, wedding_id, event_id, keep_locked)


@router.post(f"{event_seating}/auto-arrange", response_model=AutoArrangeResult)
def auto_arrange(
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    db: DB,
    _ctx: EditorTenant,
    data: AutoArrangeRequest | None = None,
):
    """Generate a draft seating plan that respects every rule, keeping locked seats."""
    return service.auto_arrange(db, wedding_id, event_id, data or AutoArrangeRequest())


@router.get("/seating-constraints", response_model=list[ConstraintRead])
def list_constraints(wedding_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    return service.list_constraints(db, wedding_id)


@router.post(
    "/seating-constraints", response_model=ConstraintRead, status_code=status.HTTP_201_CREATED
)
def create_constraint(wedding_id: uuid.UUID, data: ConstraintCreate, db: DB, _ctx: EditorTenant):
    """Record that two guests must be kept apart (or must sit together) at every event."""
    return service.create_constraint(db, wedding_id, data)


@router.delete("/seating-constraints/{constraint_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_constraint(wedding_id: uuid.UUID, constraint_id: uuid.UUID, db: DB, _ctx: EditorTenant):
    service.delete_constraint(db, wedding_id, constraint_id)
