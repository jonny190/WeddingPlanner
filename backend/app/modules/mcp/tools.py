"""The tools the MCP server offers. Each is a thin wrapper over a service function.

Docstrings are what the agent reads, so they say what a tool does, what it needs, and
whether it changes anything. Tools that change data open the account with the editor role,
which a read-only key cannot satisfy.
"""

import uuid
from datetime import date, datetime

from mcp.server.mcpserver import Context, MCPServer
from pydantic import BaseModel, Field

from app.modules.guests import service as guests
from app.modules.guests.models import AgeGroup, RsvpStatus
from app.modules.guests.schemas import (
    GuestCreate,
    GuestRead,
    GuestUpdate,
    InvitationSpec,
)
from app.modules.invitations import service as invitations
from app.modules.invitations.models import DeliveryStatus, DraftStatus, InvitationDraft
from app.modules.invitations.schemas import (
    Audience,
    DeliveryRead,
    DraftCreate,
    DraftUpdate,
    PreviewRequest,
    SendRequest,
    SendResult,
)
from app.modules.mcp.server import Accounts
from app.modules.menus import service as menus
from app.modules.menus.schemas import (
    MenuChoicesReport,
    MenuCourseIn,
    MenuCourseRead,
    MenuRead,
    MenuUpdate,
)
from app.modules.rsvp import service as rsvp
from app.modules.rsvp.schemas import Engagement, ReplyRow, ReplyUpdate, WeddingSummary
from app.modules.seating import service as seating
from app.modules.seating.models import ConstraintKind, TableShape
from app.modules.seating.schemas import (
    AutoArrangeRequest,
    AutoArrangeResult,
    ConstraintCreate,
    ConstraintRead,
    SeatingPlan,
    TableRead,
    TablesBulkCreate,
)
from app.modules.tenancy.models import Role, Tenant, User
from app.modules.weddings import service as weddings
from app.modules.weddings import venues as venue_service
from app.modules.weddings.models import VenueStatus
from app.modules.weddings.schemas import (
    EventRead,
    EventUpdate,
    VenueContactIn,
    VenueCreate,
    VenueRead,
    VenueUpdate,
    WeddingCreate,
    WeddingRead,
)


class WhoAmI(BaseModel):
    account_id: uuid.UUID
    account_name: str
    acting_as: str
    role: Role
    can_make_changes: bool
    can_send_email: bool


class DraftSummary(BaseModel):
    """An invitation draft without its card design, which is large and not useful to an agent."""

    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    subject: str
    body: str
    status: DraftStatus
    sent_count: int
    last_sent_at: datetime | None

    @classmethod
    def of(cls, draft: InvitationDraft) -> "DraftSummary":
        return cls.model_validate(draft, from_attributes=True)


class PreviewSummary(BaseModel):
    guest_name: str
    subject: str
    text: str
    # Placeholders in the draft that are not recognised and would be sent as written.
    unknown_placeholders: list[str]


def _set(**values):
    """Only the arguments that were given, so an update leaves the other fields alone."""
    return {k: v for k, v in values.items() if v is not None}


def register(mcp: MCPServer, accounts: Accounts) -> None:  # noqa: PLR0915 - one tool per function
    settings = accounts.settings

    # --- The account ------------------------------------------------------------------------

    @mcp.tool()
    def whoami(ctx: Context) -> WhoAmI:
        """Which account this key works in, who it acts as, and what it is allowed to do."""
        with accounts.open(ctx) as (db, tenant):
            account = db.get(Tenant, tenant.tenant_id)
            user = db.get(User, tenant.user_id)
            return WhoAmI(
                account_id=tenant.tenant_id,
                account_name=account.name if account else "",
                acting_as=user.full_name if user else "",
                role=tenant.role,
                can_make_changes=tenant.has_role(Role.editor),
                can_send_email=tenant.can_send and tenant.has_role(Role.editor),
            )

    # --- Weddings and events ----------------------------------------------------------------

    @mcp.tool()
    def list_weddings(ctx: Context) -> list[WeddingRead]:
        """Every wedding in the account with its events and their ids. Start here."""
        with accounts.open(ctx) as (db, _):
            return [WeddingRead.model_validate(w) for w in weddings.list_weddings(db)]

    @mcp.tool()
    def get_wedding(wedding_id: uuid.UUID, ctx: Context) -> WeddingRead:
        """One wedding with its events (name, kind, when, venue, reply-by date)."""
        with accounts.open(ctx) as (db, _):
            return WeddingRead.model_validate(weddings.get_wedding(db, wedding_id))

    @mcp.tool()
    def create_wedding(
        partner_one_name: str,
        partner_two_name: str,
        ctx: Context,
        wedding_date: date | None = None,
        contact_email: str | None = None,
        title: str | None = None,
    ) -> WeddingRead:
        """Changes data. Add a wedding; it starts with a Wedding Day and an Evening Reception."""
        with accounts.open(ctx, Role.editor) as (db, _):
            data = WeddingCreate(
                partner_one_name=partner_one_name,
                partner_two_name=partner_two_name,
                wedding_date=wedding_date,
                contact_email=contact_email,
                title=title,
            )
            return WeddingRead.model_validate(weddings.create_wedding(db, data))

    @mcp.tool()
    def update_event(
        wedding_id: uuid.UUID,
        event_id: uuid.UUID,
        ctx: Context,
        name: str | None = None,
        starts_at: datetime | None = None,
        ends_at: datetime | None = None,
        venue_id: uuid.UUID | None = None,
        venue_name: str | None = None,
        venue_address: str | None = None,
        details: str | None = None,
        rsvp_deadline: date | None = None,
    ) -> EventRead:
        """Changes data. Set an event's name, times (venue local time), venue, details or
        reply-by date. Fields left out are unchanged. venue_id chooses a venue from the
        wedding's list (see list_venues), which then supplies the name and address; use
        choose_venue to clear it."""
        with accounts.open(ctx, Role.editor) as (db, _):
            data = EventUpdate(
                **_set(
                    name=name,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    venue_id=venue_id,
                    venue_name=venue_name,
                    venue_address=venue_address,
                    details=details,
                    rsvp_deadline=rsvp_deadline,
                )
            )
            return EventRead.model_validate(weddings.update_event(db, wedding_id, event_id, data))

    # --- Guests -----------------------------------------------------------------------------

    @mcp.tool()
    def list_guests(
        wedding_id: uuid.UUID,
        ctx: Context,
        search: str | None = None,
        group: str | None = None,
        event_id: uuid.UUID | None = None,
    ) -> list[GuestRead]:
        """Guests of a wedding with their per-event invitations and replies. Filter by a name
        or email fragment, a group name, or an event they are invited to."""
        with accounts.open(ctx) as (db, _):
            found = guests.list_guests(
                db, wedding_id, search=search, group_name=group, event_id=event_id
            )
            return [GuestRead.model_validate(g) for g in found]

    @mcp.tool()
    def get_guest(wedding_id: uuid.UUID, guest_id: uuid.UUID, ctx: Context) -> GuestRead:
        """One guest, with every event they are invited to and how they replied."""
        with accounts.open(ctx) as (db, _):
            return GuestRead.model_validate(guests.get_guest(db, wedding_id, guest_id))

    @mcp.tool()
    def add_guest(
        wedding_id: uuid.UUID,
        first_name: str,
        ctx: Context,
        last_name: str = "",
        email: str | None = None,
        phone: str | None = None,
        group_name: str | None = None,
        age_group: AgeGroup = AgeGroup.adult,
        dietary_requirements: str | None = None,
        notes: str | None = None,
        invitations: list[InvitationSpec] = Field(default_factory=list),
    ) -> GuestRead:
        """Changes data. Add a guest, optionally inviting them to events straight away
        (each with its own plus-one allowance)."""
        with accounts.open(ctx, Role.editor) as (db, _):
            data = GuestCreate(
                first_name=first_name,
                last_name=last_name,
                email=email,
                phone=phone,
                group_name=group_name,
                age_group=age_group,
                dietary_requirements=dietary_requirements,
                notes=notes,
                invitations=invitations,
            )
            return GuestRead.model_validate(guests.create_guest(db, wedding_id, data))

    @mcp.tool()
    def update_guest(
        wedding_id: uuid.UUID,
        guest_id: uuid.UUID,
        ctx: Context,
        first_name: str | None = None,
        last_name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        group_name: str | None = None,
        age_group: AgeGroup | None = None,
        dietary_requirements: str | None = None,
        notes: str | None = None,
    ) -> GuestRead:
        """Changes data. Update a guest's details; fields left out are unchanged. Use
        invite_guest and uninvite_guest to change which events they are invited to."""
        with accounts.open(ctx, Role.editor) as (db, _):
            data = GuestUpdate(
                **_set(
                    first_name=first_name,
                    last_name=last_name,
                    email=email,
                    phone=phone,
                    group_name=group_name,
                    age_group=age_group,
                    dietary_requirements=dietary_requirements,
                    notes=notes,
                )
            )
            return GuestRead.model_validate(guests.update_guest(db, wedding_id, guest_id, data))

    @mcp.tool()
    def delete_guest(wedding_id: uuid.UUID, guest_id: uuid.UUID, ctx: Context) -> str:
        """Changes data. Remove a guest, with their invitations, replies and seat. Confirm
        with the person first."""
        with accounts.open(ctx, Role.editor) as (db, _):
            name = guests.get_guest(db, wedding_id, guest_id).full_name
            guests.delete_guest(db, wedding_id, guest_id)
            return f"Removed {name}"

    @mcp.tool()
    def invite_guest(
        wedding_id: uuid.UUID,
        guest_id: uuid.UUID,
        event_id: uuid.UUID,
        ctx: Context,
        plus_one_allowed: bool = False,
    ) -> GuestRead:
        """Changes data. Invite a guest to an event, or change whether they may bring a
        plus-one to it. Other events are unaffected."""
        with accounts.open(ctx, Role.editor) as (db, _):
            guests.set_invitation(db, wedding_id, guest_id, event_id, plus_one_allowed)
            return GuestRead.model_validate(guests.get_guest(db, wedding_id, guest_id))

    @mcp.tool()
    def uninvite_guest(
        wedding_id: uuid.UUID, guest_id: uuid.UUID, event_id: uuid.UUID, ctx: Context
    ) -> GuestRead:
        """Changes data. Withdraw a guest's invitation to one event (their reply and seat for
        that event go too)."""
        with accounts.open(ctx, Role.editor) as (db, _):
            guests.remove_invitation(db, wedding_id, guest_id, event_id)
            return GuestRead.model_validate(guests.get_guest(db, wedding_id, guest_id))

    # --- Replies ----------------------------------------------------------------------------

    @mcp.tool()
    def wedding_summary(wedding_id: uuid.UUID, ctx: Context) -> WeddingSummary:
        """Headline numbers per event: invited, sent, opened, attending, declined, pending,
        headcounts and dietary notes."""
        with accounts.open(ctx) as (db, _):
            return rsvp.wedding_summary(db, wedding_id)

    @mcp.tool()
    def list_replies(
        wedding_id: uuid.UUID,
        event_id: uuid.UUID,
        ctx: Context,
        status: RsvpStatus | None = None,
        engagement: Engagement | None = None,
    ) -> list[ReplyRow]:
        """Who has replied to an event and how, with plus-ones, dietary needs, messages and
        whether the invitation was sent and opened. engagement=opened lists guests who opened
        their invitation but have not replied."""
        with accounts.open(ctx) as (db, _):
            return rsvp.list_replies(db, wedding_id, event_id, status, engagement)

    @mcp.tool()
    def record_reply(
        wedding_id: uuid.UUID,
        event_id: uuid.UUID,
        guest_id: uuid.UUID,
        rsvp_status: RsvpStatus,
        ctx: Context,
        plus_one_attending: bool | None = None,
        plus_one_name: str | None = None,
        plus_one_dietary: str | None = None,
        dietary_requirements: str | None = None,
        guest_message: str | None = None,
    ) -> ReplyRow:
        """Changes data. Record a reply received by phone or post. rsvp_status pending clears
        an earlier reply."""
        with accounts.open(ctx, Role.editor) as (db, _):
            data = ReplyUpdate(
                rsvp_status=rsvp_status,
                **_set(
                    plus_one_attending=plus_one_attending,
                    plus_one_name=plus_one_name,
                    plus_one_dietary=plus_one_dietary,
                    dietary_requirements=dietary_requirements,
                    guest_message=guest_message,
                ),
            )
            return rsvp.record_reply(db, wedding_id, event_id, guest_id, data)

    # --- Seating ----------------------------------------------------------------------------

    @mcp.tool()
    def get_seating_plan(wedding_id: uuid.UUID, event_id: uuid.UUID, ctx: Context) -> SeatingPlan:
        """The room for an event: tables, who sits where, who has no seat yet, and any rule
        breaches."""
        with accounts.open(ctx) as (db, _):
            return seating.get_plan(db, wedding_id, event_id)

    @mcp.tool()
    def set_up_tables(
        wedding_id: uuid.UUID,
        event_id: uuid.UUID,
        count: int,
        capacity: int,
        ctx: Context,
        shape: TableShape = TableShape.round,
        name_prefix: str = "Table",
        replace_existing: bool = False,
    ) -> list[TableRead]:
        """Changes data. Add tables to an event's room in one go, e.g. 12 tables of 10.
        replace_existing removes the current layout (and seats) first."""
        with accounts.open(ctx, Role.editor) as (db, _):
            data = TablesBulkCreate(
                count=count,
                capacity=capacity,
                shape=shape,
                name_prefix=name_prefix,
                replace_existing=replace_existing,
            )
            created = seating.bulk_create_tables(db, wedding_id, event_id, data)
            return [TableRead.model_validate(t) for t in created]

    @mcp.tool()
    def list_seating_rules(wedding_id: uuid.UUID, ctx: Context) -> list[ConstraintRead]:
        """Pairs of guests who must be kept apart, or seated together, at every event."""
        with accounts.open(ctx) as (db, _):
            return seating.list_constraints(db, wedding_id)

    @mcp.tool()
    def add_seating_rule(
        wedding_id: uuid.UUID,
        guest_a_id: uuid.UUID,
        guest_b_id: uuid.UUID,
        ctx: Context,
        kind: ConstraintKind = ConstraintKind.apart,
        note: str | None = None,
    ) -> ConstraintRead:
        """Changes data. Record that two guests must not share a table (kind apart) or must
        sit together (kind together). Applies at every event."""
        with accounts.open(ctx, Role.editor) as (db, _):
            data = ConstraintCreate(
                guest_a_id=guest_a_id, guest_b_id=guest_b_id, kind=kind, note=note
            )
            return seating.create_constraint(db, wedding_id, data)

    @mcp.tool()
    def delete_seating_rule(wedding_id: uuid.UUID, rule_id: uuid.UUID, ctx: Context) -> str:
        """Changes data. Remove a seating rule."""
        with accounts.open(ctx, Role.editor) as (db, _):
            seating.delete_constraint(db, wedding_id, rule_id)
            return "Rule removed"

    @mcp.tool()
    def seat_guest(
        wedding_id: uuid.UUID,
        event_id: uuid.UUID,
        guest_id: uuid.UUID,
        ctx: Context,
        table_id: uuid.UUID | None = None,
        locked: bool = False,
    ) -> SeatingPlan:
        """Changes data. Put a guest (and their plus-one) at a table, or take them off every
        table with no table_id. Refused if the table is full or a keep-apart rule would be
        broken. locked keeps the seat when the plan is auto-arranged."""
        with accounts.open(ctx, Role.editor) as (db, _):
            return seating.assign_guest(db, wedding_id, event_id, guest_id, table_id, locked)

    @mcp.tool()
    def auto_arrange_seating(
        wedding_id: uuid.UUID,
        event_id: uuid.UUID,
        ctx: Context,
        include_pending: bool = True,
        keep_locked: bool = True,
    ) -> AutoArrangeResult:
        """Changes data. Rearrange everyone who is not locked into a plan that respects every
        rule and keeps groups together where it can. Reports anyone it could not place."""
        with accounts.open(ctx, Role.editor) as (db, _):
            options = AutoArrangeRequest(include_pending=include_pending, keep_locked=keep_locked)
            return seating.auto_arrange(db, wedding_id, event_id, options)

    # --- Menus ------------------------------------------------------------------------------

    @mcp.tool()
    def get_menu(wedding_id: uuid.UUID, event_id: uuid.UUID, ctx: Context) -> MenuRead:
        """The courses and dishes guests choose from at an event (empty if there is no menu)."""
        with accounts.open(ctx) as (db, _):
            courses = menus.get_menu(db, wedding_id, event_id)
            return MenuRead(
                event_id=event_id, courses=[MenuCourseRead.model_validate(c) for c in courses]
            )

    @mcp.tool()
    def replace_menu(
        wedding_id: uuid.UUID, event_id: uuid.UUID, courses: list[MenuCourseIn], ctx: Context
    ) -> MenuRead:
        """Changes data. Save the whole menu for an event. Pass existing courses and dishes
        with their ids to keep the choices guests have already made; anything left out is
        removed."""
        with accounts.open(ctx, Role.editor) as (db, _):
            saved = menus.replace_menu(db, wedding_id, event_id, MenuUpdate(courses=courses))
            return MenuRead(
                event_id=event_id, courses=[MenuCourseRead.model_validate(c) for c in saved]
            )

    @mcp.tool()
    def menu_choices(wedding_id: uuid.UUID, event_id: uuid.UUID, ctx: Context) -> MenuChoicesReport:
        """How many of each dish, who is having what, and who still has to choose."""
        with accounts.open(ctx) as (db, _):
            return menus.report(db, wedding_id, event_id)

    # --- Invitations ------------------------------------------------------------------------

    @mcp.tool()
    def list_drafts(wedding_id: uuid.UUID, event_id: uuid.UUID, ctx: Context) -> list[DraftSummary]:
        """The invitation drafts for an event, with their email subject and body."""
        with accounts.open(ctx) as (db, _):
            return [DraftSummary.of(d) for d in invitations.list_drafts(db, wedding_id, event_id)]

    @mcp.tool()
    def create_draft(
        wedding_id: uuid.UUID,
        event_id: uuid.UUID,
        ctx: Context,
        name: str = "Invitation",
        subject: str | None = None,
        body: str | None = None,
        copy_from_draft_id: uuid.UUID | None = None,
    ) -> DraftSummary:
        """Changes data. Start an invitation draft. Left empty, the subject, body and card
        design get sensible defaults; placeholders like {{first_name}} and {{event_when}}
        are filled per guest."""
        with accounts.open(ctx, Role.editor) as (db, _):
            data = DraftCreate(
                name=name, subject=subject, body=body, copy_from_draft_id=copy_from_draft_id
            )
            return DraftSummary.of(invitations.create_draft(db, wedding_id, event_id, data))

    @mcp.tool()
    def update_draft_text(
        wedding_id: uuid.UUID,
        event_id: uuid.UUID,
        draft_id: uuid.UUID,
        ctx: Context,
        name: str | None = None,
        subject: str | None = None,
        body: str | None = None,
    ) -> DraftSummary:
        """Changes data. Change a draft's name, email subject or body. The card design is
        edited in the web app."""
        with accounts.open(ctx, Role.editor) as (db, _):
            data = DraftUpdate(**_set(name=name, subject=subject, body=body))
            return DraftSummary.of(
                invitations.update_draft(db, wedding_id, event_id, draft_id, data)
            )

    @mcp.tool()
    def preview_draft(
        wedding_id: uuid.UUID,
        event_id: uuid.UUID,
        draft_id: uuid.UUID,
        ctx: Context,
        guest_id: uuid.UUID | None = None,
    ) -> PreviewSummary:
        """The email a guest would receive from a draft, with placeholders filled in (an
        example guest if none is given)."""
        with accounts.open(ctx) as (db, _):
            preview = invitations.preview_draft(
                db,
                wedding_id,
                event_id,
                draft_id,
                PreviewRequest(guest_id=guest_id),
                settings.public_app_url,
            )
            return PreviewSummary(
                guest_name=preview.guest_name,
                subject=preview.subject,
                text=preview.text,
                unknown_placeholders=preview.unknown_placeholders,
            )

    @mcp.tool()
    def send_invitations(
        wedding_id: uuid.UUID,
        event_id: uuid.UUID,
        draft_id: uuid.UUID,
        ctx: Context,
        audience: Audience = Audience.unsent,
        guest_ids: list[uuid.UUID] = Field(default_factory=list),
        dry_run: bool = True,
    ) -> SendResult:
        """Queue a draft to an audience: unsent, pending (no reply yet), opened_no_reply,
        not_opened, all, or selected (give guest_ids). A dry run (the default) only reports who
        would receive it and who has no email. Sending for real changes data, emails guests,
        and needs a key that may send email. Check with the person before sending."""
        with accounts.open(ctx, Role.editor) as (db, tenant):
            if not dry_run:
                tenant.require_send()
            request = SendRequest(audience=audience, guest_ids=guest_ids, dry_run=dry_run)
            return invitations.send_draft(
                db, wedding_id, event_id, draft_id, request, settings.public_app_url
            )

    @mcp.tool()
    def mark_invitations_sent(
        wedding_id: uuid.UUID, event_id: uuid.UUID, guest_ids: list[uuid.UUID], ctx: Context
    ) -> str:
        """Changes data. Record that invitations were posted or handed over in person, so the
        guests' RSVP links show the event. Sends nothing."""
        with accounts.open(ctx, Role.editor) as (db, _):
            count = invitations.mark_sent(db, wedding_id, event_id, guest_ids)
            return f"Marked {count} invitation(s) as sent"

    @mcp.tool()
    def list_deliveries(
        wedding_id: uuid.UUID,
        ctx: Context,
        event_id: uuid.UUID | None = None,
        status: DeliveryStatus | None = None,
    ) -> list[DeliveryRead]:
        """Emails queued, sent or failed for a wedding, newest first."""
        with accounts.open(ctx) as (db, _):
            return invitations.list_deliveries(db, wedding_id, event_id=event_id, status=status)

    # --- Venues -----------------------------------------------------------------------------

    @mcp.tool()
    def list_venues(wedding_id: uuid.UUID, ctx: Context) -> list[VenueRead]:
        """The venues being considered for a wedding: status, address, prices, contacts,
        notes, and which events each one is chosen for. Booked venues come first."""
        with accounts.open(ctx) as (db, _):
            return venue_service.list_venues(db, wedding_id)

    @mcp.tool()
    def add_venue(
        wedding_id: uuid.UUID,
        name: str,
        ctx: Context,
        status: VenueStatus = VenueStatus.considering,
        address: str | None = None,
        website: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        capacity: int | None = None,
        price: float | None = None,
        price_per_head: float | None = None,
        deposit: float | None = None,
        currency: str = "GBP",
        price_notes: str | None = None,
        notes: str | None = None,
        contacts: list[VenueContactIn] = Field(default_factory=list),
    ) -> VenueRead:
        """Changes data. Add a venue to the list with its address, how to reach it, prices
        (hire, per head, deposit, in the given currency), contacts and notes."""
        with accounts.open(ctx, Role.editor) as (db, _):
            data = VenueCreate(
                name=name,
                status=status,
                address=address,
                website=website,
                email=email,
                phone=phone,
                capacity=capacity,
                price=price,
                price_per_head=price_per_head,
                deposit=deposit,
                currency=currency,
                price_notes=price_notes,
                notes=notes,
                contacts=contacts,
            )
            return venue_service.create_venue(db, wedding_id, data)

    @mcp.tool()
    def update_venue(
        wedding_id: uuid.UUID,
        venue_id: uuid.UUID,
        ctx: Context,
        name: str | None = None,
        status: VenueStatus | None = None,
        address: str | None = None,
        website: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        capacity: int | None = None,
        price: float | None = None,
        price_per_head: float | None = None,
        deposit: float | None = None,
        currency: str | None = None,
        price_notes: str | None = None,
        notes: str | None = None,
        contacts: list[VenueContactIn] | None = None,
    ) -> VenueRead:
        """Changes data. Update a venue; fields left out are unchanged. Giving contacts
        replaces the whole list. Mark a venue booked by setting status."""
        with accounts.open(ctx, Role.editor) as (db, _):
            data = VenueUpdate(
                **_set(
                    name=name,
                    status=status,
                    address=address,
                    website=website,
                    email=email,
                    phone=phone,
                    capacity=capacity,
                    price=price,
                    price_per_head=price_per_head,
                    deposit=deposit,
                    currency=currency,
                    price_notes=price_notes,
                    notes=notes,
                    contacts=contacts,
                )
            )
            return venue_service.update_venue(db, wedding_id, venue_id, data)

    @mcp.tool()
    def choose_venue(
        wedding_id: uuid.UUID,
        event_id: uuid.UUID,
        ctx: Context,
        venue_id: uuid.UUID | None = None,
    ) -> EventRead:
        """Changes data. Make a venue from the list the venue for an event, so its name and
        address go on invitations and into guests' calendar entries. No venue_id clears the
        choice (the event keeps any venue typed in by hand)."""
        with accounts.open(ctx, Role.editor) as (db, _):
            event = weddings.update_event(db, wedding_id, event_id, EventUpdate(venue_id=venue_id))
            return EventRead.model_validate(event)
