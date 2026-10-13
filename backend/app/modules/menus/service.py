import uuid
from collections import Counter
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.csv_export import to_csv
from app.core.errors import BadRequest
from app.modules.guests.models import EventInvitation, RsvpStatus
from app.modules.guests.service import get_invitation
from app.modules.menus.models import MenuChoice, MenuCourse, MenuOption
from app.modules.menus.schemas import (
    ChoiceMap,
    GuestChoiceRow,
    MenuChoiceSets,
    MenuChoicesReport,
    MenuCourseRead,
    MenuUpdate,
    OptionCount,
)
from app.modules.weddings.service import get_event

# --- The menu -------------------------------------------------------------------------------


def _courses_query():
    return (
        select(MenuCourse).options(selectinload(MenuCourse.options)).order_by(MenuCourse.sort_order)
    )


def get_menu(db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID) -> list[MenuCourse]:
    get_event(db, wedding_id, event_id)
    return list(db.scalars(_courses_query().where(MenuCourse.event_id == event_id)))


def courses_for_events(
    db: Session, event_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, list[MenuCourse]]:
    """Each event's courses, for events that have a menu."""
    ids = list(event_ids)
    result: dict[uuid.UUID, list[MenuCourse]] = {}
    if not ids:
        return result
    for course in db.scalars(_courses_query().where(MenuCourse.event_id.in_(ids))):
        result.setdefault(course.event_id, []).append(course)
    return result


def replace_menu(
    db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID, data: MenuUpdate
) -> list[MenuCourse]:
    """Make the event's menu match ``data``. Existing courses and dishes are matched by id, so
    choices guests have already made of them are kept; anything left out is removed, and the
    choices of a removed dish go with it."""
    get_event(db, wedding_id, event_id)
    existing = {c.id: c for c in get_menu(db, wedding_id, event_id)}
    kept: list[MenuCourse] = []
    for position, course_in in enumerate(data.courses):
        course = existing.pop(course_in.id, None) if course_in.id else None
        if course is None:
            course = MenuCourse(wedding_id=wedding_id, event_id=event_id)
            db.add(course)
        course.name = course_in.name
        course.description = course_in.description
        course.sort_order = position
        current = {o.id: o for o in course.options}
        options: list[MenuOption] = []
        for index, option_in in enumerate(course_in.options):
            option = current.pop(option_in.id, None) if option_in.id else None
            if option is None:
                option = MenuOption()
            option.name = option_in.name
            option.description = option_in.description
            option.sort_order = index
            options.append(option)
        course.options = options
        kept.append(course)
    for removed in existing.values():
        db.delete(removed)
    db.commit()
    return get_menu(db, wedding_id, event_id)


# --- Choices --------------------------------------------------------------------------------


def choices_for_invitations(
    db: Session, invitation_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, MenuChoiceSets]:
    ids = list(invitation_ids)
    result: dict[uuid.UUID, MenuChoiceSets] = {}
    if not ids:
        return result
    for choice in db.scalars(select(MenuChoice).where(MenuChoice.invitation_id.in_(ids))):
        sets = result.setdefault(choice.invitation_id, MenuChoiceSets())
        target = sets.plus_one if choice.for_plus_one else sets.guest
        target[choice.course_id] = choice.option_id
    return result


def _validate(courses: list[MenuCourse], picks: ChoiceMap, who: str) -> None:
    by_course = {c.id: {o.id for o in c.options} for c in courses}
    for course_id, option_id in picks.items():
        if course_id not in by_course:
            raise BadRequest("One of the courses chosen is not on this menu", code="menu_mismatch")
        if option_id not in by_course[course_id]:
            raise BadRequest(
                f"The dish chosen for {who} is not one of the options", code="menu_mismatch"
            )


def _missing(courses: list[MenuCourse], picks: ChoiceMap) -> list[MenuCourse]:
    return [c for c in courses if c.id not in picks]


def set_choices(
    db: Session,
    invitation: EventInvitation,
    courses: list[MenuCourse],
    sets: MenuChoiceSets,
    *,
    require_complete: bool,
) -> None:
    """Store what this invitation's guest (and plus-one) are having.

    A guest who is not attending has no choices. With ``require_complete`` (the guest's own
    reply) every course must be chosen for everyone attending on the invitation; the couple
    recording choices by phone may leave gaps.
    """
    attending = invitation.rsvp_status == RsvpStatus.attending
    bringing = attending and invitation.plus_one_allowed and bool(invitation.plus_one_attending)
    wanted: list[tuple[bool, uuid.UUID, uuid.UUID]] = []
    if attending and courses:
        _validate(courses, sets.guest, "you")
        wanted += [(False, c, o) for c, o in sets.guest.items()]
        if require_complete and (missing := _missing(courses, sets.guest)):
            raise BadRequest(
                f"Please choose your {missing[0].name.lower()}", code="menu_choice_required"
            )
        if bringing:
            _validate(courses, sets.plus_one, "your guest")
            wanted += [(True, c, o) for c, o in sets.plus_one.items()]
            if require_complete and (missing := _missing(courses, sets.plus_one)):
                raise BadRequest(
                    f"Please choose your guest's {missing[0].name.lower()}",
                    code="menu_choice_required",
                )
    existing = db.scalars(select(MenuChoice).where(MenuChoice.invitation_id == invitation.id)).all()
    for choice in existing:
        db.delete(choice)
    db.flush()
    for for_plus_one, course_id, option_id in wanted:
        db.add(
            MenuChoice(
                invitation_id=invitation.id,
                course_id=course_id,
                option_id=option_id,
                for_plus_one=for_plus_one,
            )
        )


def clear_choices(db: Session, invitation: EventInvitation) -> None:
    for choice in db.scalars(select(MenuChoice).where(MenuChoice.invitation_id == invitation.id)):
        db.delete(choice)


def record_choices(
    db: Session,
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    guest_id: uuid.UUID,
    sets: MenuChoiceSets,
) -> GuestChoiceRow:
    """The couple writing down a guest's choices for them."""
    invitation = get_invitation(db, wedding_id, event_id, guest_id)
    courses = get_menu(db, wedding_id, event_id)
    if invitation.rsvp_status != RsvpStatus.attending:
        raise BadRequest("Record the guest as attending before choosing their dishes")
    set_choices(db, invitation, courses, sets, require_complete=False)
    db.commit()
    return _row(invitation, courses, choices_for_invitations(db, [invitation.id]))


def _row(
    invitation: EventInvitation,
    courses: list[MenuCourse],
    choices: dict[uuid.UUID, MenuChoiceSets],
) -> GuestChoiceRow:
    sets = choices.get(invitation.id, MenuChoiceSets())
    attending = invitation.rsvp_status == RsvpStatus.attending
    bringing = attending and invitation.plus_one_allowed and bool(invitation.plus_one_attending)
    complete = (
        not attending
        or not courses
        or (
            not _missing(courses, sets.guest)
            and (not bringing or not _missing(courses, sets.plus_one))
        )
    )
    return GuestChoiceRow(
        guest_id=invitation.guest_id,
        invitation_id=invitation.id,
        full_name=invitation.guest.full_name,
        rsvp_status=invitation.rsvp_status,
        plus_one_attending=invitation.plus_one_attending,
        plus_one_name=invitation.plus_one_name,
        dietary_requirements=invitation.guest.dietary_requirements,
        plus_one_dietary=invitation.plus_one_dietary,
        choices=sets,
        complete=complete,
    )


def report(db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID) -> MenuChoicesReport:
    """Everything the caterer needs: how many of each dish, and who is having what."""
    courses = get_menu(db, wedding_id, event_id)
    invitations = db.scalars(
        select(EventInvitation)
        .where(EventInvitation.event_id == event_id)
        .options(selectinload(EventInvitation.guest))
    ).all()
    invitations = sorted(
        invitations, key=lambda i: (i.guest.last_name.lower(), i.guest.first_name.lower())
    )
    choices = choices_for_invitations(db, [i.id for i in invitations])
    rows = [_row(i, courses, choices) for i in invitations]

    tally: Counter[uuid.UUID] = Counter()
    still_to_choose = 0
    for invitation, row in zip(invitations, rows, strict=True):
        if invitation.rsvp_status != RsvpStatus.attending:
            continue
        tally.update(row.choices.guest.values())
        if courses and _missing(courses, row.choices.guest):
            still_to_choose += 1
        if invitation.plus_one_allowed and invitation.plus_one_attending:
            tally.update(row.choices.plus_one.values())
            if courses and _missing(courses, row.choices.plus_one):
                still_to_choose += 1
    counts = [
        OptionCount(
            course_id=course.id,
            course_name=course.name,
            option_id=option.id,
            option_name=option.name,
            count=tally.get(option.id, 0),
        )
        for course in courses
        for option in course.options
    ]
    return MenuChoicesReport(
        event_id=event_id,
        courses=[MenuCourseRead.model_validate(c) for c in courses],
        counts=counts,
        people_still_to_choose=still_to_choose,
        rows=rows,
    )


def export_choices_csv(db: Session, wedding_id: uuid.UUID, event_id: uuid.UUID) -> str:
    """One line per person attending, with their dish for each course: the caterer's list."""
    data = report(db, wedding_id, event_id)
    option_names = {o.id: o.name for c in data.courses for o in c.options}
    header = ["name", "with", "dietary_requirements", *[c.name for c in data.courses]]
    rows = []
    for row in data.rows:
        if row.rsvp_status != RsvpStatus.attending:
            continue
        rows.append(
            [
                row.full_name,
                "",
                row.dietary_requirements or "",
                *[option_names.get(row.choices.guest.get(c.id), "") for c in data.courses],
            ]
        )
        if row.plus_one_attending:
            rows.append(
                [
                    row.plus_one_name or f"{row.full_name}'s guest",
                    row.full_name,
                    row.plus_one_dietary or "",
                    *[option_names.get(row.choices.plus_one.get(c.id), "") for c in data.courses],
                ]
            )
    return to_csv(header, rows)
