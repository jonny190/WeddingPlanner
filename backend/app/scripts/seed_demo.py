"""Create a demo account with a realistic wedding to explore the app.

    python -m app.scripts.seed_demo [--email demo@example.com] [--password demo-password]

Safe to run more than once: it does nothing if the demo user already exists.
"""

import argparse
import random
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.db import bind_tenant, create_db_engine, utcnow
from app.modules import installed_modules
from app.modules.guests.models import (
    AgeGroup,
    EventInvitation,
    Guest,
    ResponseChannel,
    RsvpStatus,
)
from app.modules.invitations import service as invitations
from app.modules.invitations.schemas import DraftCreate
from app.modules.seating import service as seating
from app.modules.seating.models import ConstraintKind, SeatingConstraint
from app.modules.seating.schemas import AutoArrangeRequest, TableCreate, TablesBulkCreate
from app.modules.tenancy import service as tenancy
from app.modules.tenancy.models import User
from app.modules.tenancy.schemas import SignupRequest
from app.modules.weddings import service as weddings
from app.modules.weddings.models import EventKind
from app.modules.weddings.schemas import WeddingCreate

GROUPS = {
    "Sam's family": 14,
    "Alex's family": 14,
    "University friends": 10,
    "Work friends": 8,
    "School friends": 6,
    "Neighbours": 4,
}
FIRST = [
    "Olivia", "Amelia", "Isla", "Ava", "Mia", "Ivy", "Lily", "Grace", "Freya", "Florence",
    "Noah", "Oliver", "George", "Leo", "Arthur", "Muhammad", "Harry", "Oscar", "Archie",
    "Henry", "Theo", "Jack", "Charlie", "Finley", "Ruby", "Evie", "Poppy", "Ella",
]  # fmt: skip
LAST = [
    "Smith", "Jones", "Taylor", "Brown", "Williams", "Wilson", "Johnson", "Davies", "Patel",
    "Robinson", "Wright", "Thompson", "Evans", "Walker", "White", "Roberts", "Green", "Hall",
    "Wood", "Jackson", "Clarke", "Hughes",
]  # fmt: skip


def seed(email: str, password: str) -> None:
    settings = get_settings()
    installed_modules()
    factory = sessionmaker(create_db_engine(settings.database_url), expire_on_commit=False)
    rng = random.Random(2027)

    with factory() as db:
        if db.scalar(select(User).where(User.email == email)):
            print(f"Demo user {email} already exists; nothing to do.")
            return
        user = tenancy.signup(
            db,
            SignupRequest(
                email=email,
                password=password,
                full_name="Demo Planner",
                account_name="Demo Weddings",
            ),
        )
        tenant_id = tenancy.tenants_for(db, user)[0].id
        bind_tenant(db, tenant_id)

        wedding_date = date.today() + timedelta(days=240)
        wedding = weddings.create_wedding(
            db,
            WeddingCreate(
                partner_one_name="Sam",
                partner_two_name="Alex",
                wedding_date=wedding_date,
                contact_email="sam.and.alex@example.com",
            ),
        )
        day = next(e for e in wedding.events if e.kind == EventKind.day)
        evening = next(e for e in wedding.events if e.kind == EventKind.evening)
        for event, start in ((day, time(13)), (evening, time(19, 30))):
            event.venue_name = "Hartwell Manor"
            event.venue_address = "Hartwell Lane, Cotswolds, GL54 1AA"
            event.starts_at = datetime.combine(wedding_date, start)
            event.rsvp_deadline = wedding_date - timedelta(days=60)
        day.details = "Ceremony at 1pm, followed by the wedding breakfast. Dress code: formal."
        evening.details = "Evening reception with dancing from 7.30pm."

        guests: list[Guest] = []
        for group, count in GROUPS.items():
            for _ in range(count):
                first, last = rng.choice(FIRST), rng.choice(LAST)
                guest = Guest(
                    wedding_id=wedding.id,
                    first_name=first,
                    last_name=last,
                    email=f"{first}.{last}{rng.randrange(100)}@example.com".lower()
                    if rng.random() > 0.08
                    else None,
                    group_name=group,
                    age_group=AgeGroup.child if rng.random() < 0.06 else AgeGroup.adult,
                )
                day_guest = "family" in group or rng.random() < 0.6
                if day_guest:
                    guest.invitations.append(
                        EventInvitation(
                            wedding_id=wedding.id,
                            event_id=day.id,
                            plus_one_allowed=rng.random() < 0.25,
                        )
                    )
                guest.invitations.append(
                    EventInvitation(
                        wedding_id=wedding.id,
                        event_id=evening.id,
                        plus_one_allowed=rng.random() < 0.35,
                    )
                )
                db.add(guest)
                guests.append(guest)
        db.flush()

        # Some invitations have gone out and replies are coming in.
        now = utcnow()
        for guest in guests:
            for invitation in guest.invitations:
                if rng.random() < 0.8:
                    invitation.first_sent_at = invitation.last_sent_at = now - timedelta(days=9)
                    roll = rng.random()
                    if roll < 0.55:
                        invitation.rsvp_status = RsvpStatus.attending
                        if invitation.plus_one_allowed:
                            invitation.plus_one_attending = rng.random() < 0.7
                            if invitation.plus_one_attending:
                                invitation.plus_one_name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
                    elif roll < 0.68:
                        invitation.rsvp_status = RsvpStatus.declined
                    if roll < 0.85:
                        invitation.first_clicked_at = invitation.last_clicked_at = now - timedelta(
                            days=rng.randrange(1, 8)
                        )
                        invitation.click_count = rng.randrange(1, 4)
                    if invitation.rsvp_status != RsvpStatus.pending:
                        invitation.responded_at = invitation.first_clicked_at or now
                        invitation.response_channel = ResponseChannel.online
            if rng.random() < 0.12:
                guest.dietary_requirements = rng.choice(
                    ["Vegetarian", "Vegan", "Gluten free", "Nut allergy", "No shellfish"]
                )

        family = [g for g in guests if g.group_name == "Sam's family"]
        db.add_all(
            [
                SeatingConstraint(
                    wedding_id=wedding.id,
                    guest_a_id=family[0].id,
                    guest_b_id=family[1].id,
                    kind=ConstraintKind.apart,
                    note="Recently divorced",
                ),
                SeatingConstraint(
                    wedding_id=wedding.id,
                    guest_a_id=guests[20].id,
                    guest_b_id=guests[35].id,
                    kind=ConstraintKind.apart,
                    note="Long-running feud",
                ),
                SeatingConstraint(
                    wedding_id=wedding.id,
                    guest_a_id=family[2].id,
                    guest_b_id=family[3].id,
                    kind=ConstraintKind.together,
                    note="Grandparents",
                ),
            ]
        )
        db.commit()

        seating.create_table(
            db, wedding.id, day.id, TableCreate(name="Top table", capacity=8, shape="rectangle")
        )
        seating.bulk_create_tables(db, wedding.id, day.id, TablesBulkCreate(count=7, capacity=10))
        seating.auto_arrange(db, wedding.id, day.id, AutoArrangeRequest())

        invitations.create_draft(db, wedding.id, day.id, DraftCreate(name="Day invitation"))
        invitations.create_draft(db, wedding.id, evening.id, DraftCreate(name="Evening invitation"))

    print(f"Created demo account: {email} / {password}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", default="demo@example.com")
    parser.add_argument("--password", default="demo-password")
    args = parser.parse_args()
    seed(args.email, args.password)


if __name__ == "__main__":
    main()
