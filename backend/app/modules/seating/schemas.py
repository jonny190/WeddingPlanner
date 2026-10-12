import uuid

from pydantic import BaseModel, Field

from app.core.schemas import ORMModel
from app.modules.guests.models import RsvpStatus
from app.modules.seating.models import ConstraintKind, TableShape


class TableCreate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    capacity: int = Field(ge=1, le=100)
    shape: TableShape = TableShape.round


class TablesBulkCreate(BaseModel):
    count: int = Field(ge=1, le=200)
    capacity: int = Field(ge=1, le=100)
    shape: TableShape = TableShape.round
    name_prefix: str = Field(default="Table", max_length=80)
    start_number: int = Field(default=1, ge=0)
    # Remove the current layout (and its seat assignments) first.
    replace_existing: bool = False


class TableUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    capacity: int | None = Field(default=None, ge=1, le=100)
    shape: TableShape | None = None
    sort_order: int | None = None


class TableRead(ORMModel):
    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    capacity: int
    shape: TableShape
    sort_order: int


class ConstraintCreate(BaseModel):
    guest_a_id: uuid.UUID
    guest_b_id: uuid.UUID
    kind: ConstraintKind = ConstraintKind.apart
    note: str | None = Field(default=None, max_length=255)


class ConstraintRead(BaseModel):
    id: uuid.UUID
    guest_a_id: uuid.UUID
    guest_a_name: str
    guest_b_id: uuid.UUID
    guest_b_name: str
    kind: ConstraintKind
    note: str | None


class AssignmentUpdate(BaseModel):
    # None removes the guest from their table.
    table_id: uuid.UUID | None
    locked: bool = False


class AutoArrangeRequest(BaseModel):
    # Seat guests who have not replied yet (assuming they will come).
    include_pending: bool = True
    # Keep locked seats where they are; everyone else is re-arranged.
    keep_locked: bool = True


class SeatedGuest(BaseModel):
    guest_id: uuid.UUID
    invitation_id: uuid.UUID
    full_name: str
    group_name: str | None
    seats: int
    plus_one_name: str | None
    rsvp_status: RsvpStatus
    locked: bool = False


class TablePlan(TableRead):
    seats_used: int
    guests: list[SeatedGuest]


class PlanViolation(BaseModel):
    kind: str
    message: str
    guest_ids: list[uuid.UUID]
    table_ids: list[uuid.UUID]


class SeatingStats(BaseModel):
    tables: int
    total_capacity: int
    seats_needed: int
    seats_assigned: int
    guests_unassigned: int


class SeatingPlan(BaseModel):
    event_id: uuid.UUID
    tables: list[TablePlan]
    unassigned: list[SeatedGuest]
    violations: list[PlanViolation]
    stats: SeatingStats


class UnplacedGuest(BaseModel):
    guest_id: uuid.UUID
    full_name: str
    reason: str


class AutoArrangeResult(BaseModel):
    plan: SeatingPlan
    unplaced: list[UnplacedGuest]
