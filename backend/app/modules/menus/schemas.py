import uuid

from pydantic import BaseModel, Field

from app.core.schemas import ORMModel
from app.modules.guests.models import RsvpStatus

# --- The menu itself -------------------------------------------------------------------------


class MenuOptionIn(BaseModel):
    # Keep the id of an existing dish so guests' choices of it survive an edit.
    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)


class MenuCourseIn(BaseModel):
    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    options: list[MenuOptionIn] = Field(min_length=1, max_length=20)


class MenuUpdate(BaseModel):
    """The whole menu for an event, in order. Courses and dishes left out are removed."""

    courses: list[MenuCourseIn] = Field(max_length=12)


class MenuOptionRead(ORMModel):
    id: uuid.UUID
    name: str
    description: str | None
    sort_order: int


class MenuCourseRead(ORMModel):
    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    description: str | None
    sort_order: int
    options: list[MenuOptionRead]


class MenuRead(BaseModel):
    event_id: uuid.UUID
    courses: list[MenuCourseRead]


# --- Choices --------------------------------------------------------------------------------

# course id -> option id
ChoiceMap = dict[uuid.UUID, uuid.UUID]


class MenuChoiceSets(BaseModel):
    """What was picked for the guest and for the person they are bringing."""

    guest: ChoiceMap = Field(default_factory=dict)
    plus_one: ChoiceMap = Field(default_factory=dict)


class GuestChoiceRow(BaseModel):
    guest_id: uuid.UUID
    invitation_id: uuid.UUID
    full_name: str
    rsvp_status: RsvpStatus
    plus_one_attending: bool | None
    plus_one_name: str | None
    dietary_requirements: str | None
    plus_one_dietary: str | None
    choices: MenuChoiceSets
    # Everyone attending on this invitation has a dish for every course.
    complete: bool


class OptionCount(BaseModel):
    course_id: uuid.UUID
    course_name: str
    option_id: uuid.UUID
    option_name: str
    # Guests and plus-ones together.
    count: int


class MenuChoicesReport(BaseModel):
    event_id: uuid.UUID
    courses: list[MenuCourseRead]
    counts: list[OptionCount]
    # Attending people (guests and plus-ones) still to choose at least one course.
    people_still_to_choose: int
    rows: list[GuestChoiceRow]
