import uuid
from dataclasses import dataclass

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import BadRequest, Conflict, NotFound
from app.modules.guests.models import EventInvitation, RsvpStatus
from app.modules.guests.service import get_guest, get_invitation
from app.modules.seating.models import (
    ConstraintKind,
    SeatAssignment,
    SeatingConstraint,
    SeatingTable,
)
from app.modules.seating.schemas import (
    AutoArrangeRequest,
    AutoArrangeResult,
    ConstraintCreate,
    ConstraintRead,
    PlanViolation,
    SeatedGuest,
    SeatingPlan,
    SeatingStats,
    TableCreate,
    TablePlan,
    TableRead,
    TablesBulkCreate,
    TableUpdate,
    UnplacedGuest,
)
from app.modules.seating.solver import PartySpec, TableSpec, check_plan, solve_seating
from app.modules.weddings.models import Event
from app.modules.weddings.service import get_event, get_wedding


@dataclass
class _EventSeating:
    event: Event
    tables: list[SeatingTable]
    invitations: dict[uuid.UUID, EventInvitation]  # by guest id
    assignments: dict[uuid.UUID, SeatAssignment]  # by guest id
    constraints: list[SeatingConstraint]

    def pairs(self, kind: ConstraintKind) -> list[tuple[uuid.UUID, uuid.UUID]]:
        return [(c.guest_a_id, c.guest_b_id) for c in self.constraints if c.kind == kind]


def _load(db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID) -> _EventSeating:
    event = get_event(db, wedding_id, event_id)
    tables = db.scalars(
        select(SeatingTable)
        .where(SeatingTable.event_id == event_id)
        .order_by(SeatingTable.sort_order, SeatingTable.created_at)
    ).all()
    invitations = db.scalars(
        select(EventInvitation)
        .where(EventInvitation.event_id == event_id)
        .options(selectinload(EventInvitation.guest))
    ).all()
    assignments = db.scalars(select(SeatAssignment).where(SeatAssignment.event_id == event_id))
    constraints = db.scalars(
        select(SeatingConstraint).where(SeatingConstraint.wedding_id == wedding_id)
    ).all()
    return _EventSeating(
        event=event,
        tables=list(tables),
        invitations={i.guest_id: i for i in invitations},
        assignments={a.guest_id: a for a in assignments},
        constraints=list(constraints),
    )


def _seated_guest(invitation: EventInvitation, locked: bool = False) -> SeatedGuest:
    return SeatedGuest(
        guest_id=invitation.guest_id,
        invitation_id=invitation.id,
        full_name=invitation.guest.full_name,
        group_name=invitation.guest.group_name,
        seats=invitation.party_size,
        plus_one_name=invitation.plus_one_name,
        rsvp_status=invitation.rsvp_status,
        locked=locked,
    )


def _sort_key(guest: SeatedGuest) -> tuple:
    return (guest.group_name or "~", guest.full_name.lower())


def _build_plan(state: _EventSeating) -> SeatingPlan:
    tables_by_id = {t.id: t for t in state.tables}
    seated: dict[uuid.UUID, list[SeatedGuest]] = {t.id: [] for t in state.tables}
    for guest_id, assignment in state.assignments.items():
        invitation = state.invitations.get(guest_id)
        if invitation is not None and assignment.table_id in seated:
            seated[assignment.table_id].append(_seated_guest(invitation, assignment.locked))

    def name(guest_id: uuid.UUID) -> str:
        invitation = state.invitations.get(guest_id)
        return invitation.guest.full_name if invitation else "A guest"

    parties = [PartySpec(id=g, size=i.party_size) for g, i in state.invitations.items()]
    table_specs = [TableSpec(t.id, t.capacity) for t in state.tables]
    placed = {g: a.table_id for g, a in state.assignments.items()}
    violations: list[PlanViolation] = []
    for v in check_plan(
        table_specs,
        parties,
        placed,
        apart=state.pairs(ConstraintKind.apart),
        together=state.pairs(ConstraintKind.together),
    ):
        table_names = [tables_by_id[t].name for t in v.table_ids if t in tables_by_id]
        if v.kind == "capacity":
            table = tables_by_id[v.table_ids[0]]
            used = sum(g.seats for g in seated[table.id])
            message = f"{table.name} has {used} people but only {table.capacity} seats"
        elif v.kind == "apart":
            a, b = v.party_ids
            message = f"{name(a)} and {name(b)} must not sit together ({table_names[0]})"
        else:
            a, b = v.party_ids
            message = f"{name(a)} and {name(b)} should sit together"
        violations.append(
            PlanViolation(
                kind=v.kind,
                message=message,
                guest_ids=list(v.party_ids),
                table_ids=list(v.table_ids),
            )
        )
    for guest_id, assignment in state.assignments.items():
        invitation = state.invitations.get(guest_id)
        if invitation and invitation.rsvp_status == RsvpStatus.declined:
            table = tables_by_id.get(assignment.table_id)
            violations.append(
                PlanViolation(
                    kind="declined",
                    message=f"{name(guest_id)} has declined but is still seated at "
                    f"{table.name if table else 'a table'}",
                    guest_ids=[guest_id],
                    table_ids=[assignment.table_id],
                )
            )

    unassigned = sorted(
        (
            _seated_guest(i)
            for g, i in state.invitations.items()
            if g not in state.assignments and i.party_size > 0
        ),
        key=_sort_key,
    )
    table_plans = [
        TablePlan(
            **TableRead.model_validate(t).model_dump(),
            seats_used=sum(g.seats for g in seated[t.id]),
            guests=sorted(seated[t.id], key=_sort_key),
        )
        for t in state.tables
    ]
    seats_assigned = sum(t.seats_used for t in table_plans)
    return SeatingPlan(
        event_id=state.event.id,
        tables=table_plans,
        unassigned=unassigned,
        violations=violations,
        stats=SeatingStats(
            tables=len(state.tables),
            total_capacity=sum(t.capacity for t in state.tables),
            seats_needed=sum(i.party_size for i in state.invitations.values()),
            seats_assigned=seats_assigned,
            guests_unassigned=len(unassigned),
        ),
    )


def get_plan(db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID) -> SeatingPlan:
    return _build_plan(_load(db, wedding_id, event_id))


# --- Room layout --------------------------------------------------------------------------


def _get_table(
    db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID, table_id: uuid.UUID
) -> SeatingTable:
    table = db.scalar(
        select(SeatingTable).where(
            SeatingTable.id == table_id,
            SeatingTable.event_id == event_id,
            SeatingTable.wedding_id == wedding_id,
        )
    )
    if table is None:
        raise NotFound("Table not found")
    return table


def _next_sort_order(db: Session, event_id: uuid.UUID) -> int:
    current = db.scalar(
        select(func.max(SeatingTable.sort_order)).where(SeatingTable.event_id == event_id)
    )
    return 0 if current is None else current + 1


def create_table(
    db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID, data: TableCreate
) -> SeatingTable:
    get_event(db, wedding_id, event_id)
    sort_order = _next_sort_order(db, event_id)
    table = SeatingTable(
        wedding_id=wedding_id,
        event_id=event_id,
        name=data.name or f"Table {sort_order + 1}",
        capacity=data.capacity,
        shape=data.shape,
        sort_order=sort_order,
    )
    db.add(table)
    db.commit()
    return table


def bulk_create_tables(
    db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID, data: TablesBulkCreate
) -> list[SeatingTable]:
    get_event(db, wedding_id, event_id)
    if data.replace_existing:
        for table in db.scalars(select(SeatingTable).where(SeatingTable.event_id == event_id)):
            db.delete(table)
        db.flush()
    first = _next_sort_order(db, event_id)
    prefix = data.name_prefix.strip()
    tables = [
        SeatingTable(
            wedding_id=wedding_id,
            event_id=event_id,
            name=f"{prefix} {data.start_number + i}".strip(),
            capacity=data.capacity,
            shape=data.shape,
            sort_order=first + i,
        )
        for i in range(data.count)
    ]
    db.add_all(tables)
    db.commit()
    return tables


def update_table(
    db: Session,
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    table_id: uuid.UUID,
    data: TableUpdate,
) -> SeatingTable:
    table = _get_table(db, wedding_id, event_id, table_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(table, field, value)
    db.commit()
    return table


def delete_table(
    db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID, table_id: uuid.UUID
) -> None:
    db.delete(_get_table(db, wedding_id, event_id, table_id))
    db.commit()


# --- Assignments ----------------------------------------------------------------------------


def assign_guest(
    db: Session,
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    guest_id: uuid.UUID,
    table_id: uuid.UUID | None,
    locked: bool,
) -> SeatingPlan:
    invitation = get_invitation(db, wedding_id, event_id, guest_id)
    state = _load(db, wedding_id, event_id)
    current = state.assignments.get(guest_id)

    if table_id is None:
        if current is not None:
            db.delete(current)
            db.commit()
        return get_plan(db, wedding_id, event_id)

    if invitation.rsvp_status == RsvpStatus.declined:
        raise Conflict(f"{invitation.guest.full_name} has declined this event")
    table = _get_table(db, wedding_id, event_id, table_id)
    others = [a for g, a in state.assignments.items() if a.table_id == table_id and g != guest_id]
    used = sum(state.invitations[a.guest_id].party_size for a in others)
    if used + invitation.party_size > table.capacity:
        raise Conflict(
            f"{table.name} only has {table.capacity - used} free seat(s); "
            f"{invitation.guest.full_name} needs {invitation.party_size}",
            code="table_full",
        )
    seated_here = {a.guest_id for a in others}
    clashes = [
        b if a == guest_id else a
        for a, b in state.pairs(ConstraintKind.apart)
        if guest_id in (a, b) and (b if a == guest_id else a) in seated_here
    ]
    if clashes:
        names = ", ".join(state.invitations[g].guest.full_name for g in clashes)
        raise Conflict(
            f"{invitation.guest.full_name} cannot sit with {names}",
            code="seating_conflict",
            extra={"guest_ids": [str(g) for g in clashes]},
        )

    if current is None:
        db.add(
            SeatAssignment(
                wedding_id=wedding_id,
                event_id=event_id,
                table_id=table_id,
                invitation_id=invitation.id,
                guest_id=guest_id,
                locked=locked,
            )
        )
    else:
        current.table_id = table_id
        current.locked = locked
    db.commit()
    return get_plan(db, wedding_id, event_id)


def clear_assignments(
    db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID, keep_locked: bool
) -> SeatingPlan:
    get_event(db, wedding_id, event_id)
    statement = delete(SeatAssignment).where(SeatAssignment.event_id == event_id)
    if keep_locked:
        statement = statement.where(SeatAssignment.locked.is_(False))
    db.execute(statement)
    db.commit()
    return get_plan(db, wedding_id, event_id)


def auto_arrange(
    db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID, options: AutoArrangeRequest
) -> AutoArrangeResult:
    state = _load(db, wedding_id, event_id)
    if not state.tables:
        raise BadRequest("Add some tables to the room before arranging seats")

    kept: dict[uuid.UUID, SeatAssignment] = {}
    for guest_id, assignment in state.assignments.items():
        invitation = state.invitations.get(guest_id)
        keep = (
            options.keep_locked
            and assignment.locked
            and invitation is not None
            and invitation.party_size > 0
        )
        if keep:
            kept[guest_id] = assignment
        else:
            db.delete(assignment)
    db.flush()

    parties = [
        PartySpec(
            id=guest_id,
            size=invitation.party_size,
            group=invitation.guest.group_name,
            locked_table=kept[guest_id].table_id if guest_id in kept else None,
        )
        for guest_id, invitation in state.invitations.items()
        if invitation.party_size > 0
        and (
            options.include_pending
            or invitation.rsvp_status == RsvpStatus.attending
            or guest_id in kept  # a locked seat is occupied whatever their reply
        )
    ]
    result = solve_seating(
        [TableSpec(t.id, t.capacity) for t in state.tables],
        parties,
        apart=state.pairs(ConstraintKind.apart),
        together=state.pairs(ConstraintKind.together),
    )
    for guest_id, table_id in result.assignments.items():
        if guest_id in kept:
            continue
        db.add(
            SeatAssignment(
                wedding_id=wedding_id,
                event_id=event_id,
                table_id=table_id,
                invitation_id=state.invitations[guest_id].id,
                guest_id=guest_id,
            )
        )
    db.commit()
    unplaced = [
        UnplacedGuest(
            guest_id=guest_id,
            full_name=state.invitations[guest_id].guest.full_name,
            reason=reason,
        )
        for guest_id, reason in result.unplaced.items()
    ]
    return AutoArrangeResult(plan=get_plan(db, wedding_id, event_id), unplaced=unplaced)


# --- Constraints ----------------------------------------------------------------------------


def _constraint_read(c: SeatingConstraint) -> ConstraintRead:
    return ConstraintRead(
        id=c.id,
        guest_a_id=c.guest_a_id,
        guest_a_name=c.guest_a.full_name,
        guest_b_id=c.guest_b_id,
        guest_b_name=c.guest_b.full_name,
        kind=c.kind,
        note=c.note,
    )


def list_constraints(db: Session, wedding_id: uuid.UUID) -> list[ConstraintRead]:
    get_wedding(db, wedding_id)
    constraints = db.scalars(
        select(SeatingConstraint)
        .where(SeatingConstraint.wedding_id == wedding_id)
        .options(selectinload(SeatingConstraint.guest_a), selectinload(SeatingConstraint.guest_b))
        .order_by(SeatingConstraint.created_at)
    )
    return [_constraint_read(c) for c in constraints]


def create_constraint(db: Session, wedding_id: uuid.UUID, data: ConstraintCreate) -> ConstraintRead:
    if data.guest_a_id == data.guest_b_id:
        raise BadRequest("Choose two different guests")
    guest_a = get_guest(db, wedding_id, data.guest_a_id)
    guest_b = get_guest(db, wedding_id, data.guest_b_id)
    if str(guest_a.id) > str(guest_b.id):
        guest_a, guest_b = guest_b, guest_a
    existing = db.scalar(
        select(SeatingConstraint).where(
            SeatingConstraint.wedding_id == wedding_id,
            SeatingConstraint.guest_a_id == guest_a.id,
            SeatingConstraint.guest_b_id == guest_b.id,
        )
    )
    if existing is not None:
        raise Conflict(
            f"There is already a seating rule for {guest_a.full_name} and {guest_b.full_name}"
        )
    constraint = SeatingConstraint(
        wedding_id=wedding_id,
        guest_a_id=guest_a.id,
        guest_b_id=guest_b.id,
        kind=data.kind,
        note=data.note,
    )
    db.add(constraint)
    db.commit()
    db.refresh(constraint)
    return _constraint_read(constraint)


def delete_constraint(db: Session, wedding_id: uuid.UUID, constraint_id: uuid.UUID) -> None:
    constraint = db.scalar(
        select(SeatingConstraint).where(
            SeatingConstraint.id == constraint_id, SeatingConstraint.wedding_id == wedding_id
        )
    )
    if constraint is None:
        raise NotFound("Seating rule not found")
    db.delete(constraint)
    db.commit()
