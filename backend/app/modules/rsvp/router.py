import uuid

from fastapi import APIRouter
from fastapi.responses import Response

from app.core.ratelimit import PublicRequest
from app.modules.guests.models import RsvpStatus
from app.modules.rsvp import service
from app.modules.rsvp.schemas import (
    Engagement,
    EventReplySummary,
    ReplyRow,
    ReplyUpdate,
    RsvpSubmit,
    RsvpView,
    WeddingSummary,
)
from app.modules.tenancy.deps import DB, AppSettings, CurrentTenant, EditorTenant

router = APIRouter(prefix="/weddings/{wedding_id}", tags=["Replies"])
public_router = APIRouter(prefix="/rsvp", tags=["Public RSVP"], dependencies=[PublicRequest])


@router.get("/summary", response_model=WeddingSummary)
def wedding_summary(wedding_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    """Headline numbers for every event: invited, sent, attending, declined, headcount."""
    return service.wedding_summary(db, wedding_id)


@router.get("/events/{event_id}/replies", response_model=list[ReplyRow])
def list_replies(
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    db: DB,
    _ctx: CurrentTenant,
    status: RsvpStatus | None = None,
    engagement: Engagement | None = None,
):
    """Replies for an event. engagement=opened lists guests who opened the link but never
    replied."""
    return service.list_replies(db, wedding_id, event_id, status, engagement)


@router.get("/events/{event_id}/replies/summary", response_model=EventReplySummary)
def event_summary(wedding_id: uuid.UUID, event_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    return service.event_summary(db, wedding_id, event_id)


@router.get("/events/{event_id}/replies/export", response_class=Response)
def export_replies(wedding_id: uuid.UUID, event_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    return Response(
        content=service.export_replies_csv(db, wedding_id, event_id),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="replies.csv"'},
    )


@router.put("/events/{event_id}/replies/{guest_id}", response_model=ReplyRow)
def record_reply(
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    guest_id: uuid.UUID,
    data: ReplyUpdate,
    db: DB,
    _ctx: EditorTenant,
):
    """Record a reply that arrived by phone, post or in person."""
    return service.record_reply(db, wedding_id, event_id, guest_id, data)


@public_router.get("/{token}", response_model=RsvpView)
def view_invitation(token: str, db: DB, settings: AppSettings):
    """What a guest sees when they open their personal RSVP link."""
    return service.rsvp_view(db, token, settings.public_app_url)


@public_router.post("/{token}", response_model=RsvpView)
def submit_rsvp(token: str, data: RsvpSubmit, db: DB, settings: AppSettings):
    return service.submit_rsvp(db, token, data, settings.public_app_url)


@public_router.get("/{token}/calendar.ics", response_class=Response)
def event_calendar(token: str, db: DB, settings: AppSettings, event: uuid.UUID | None = None):
    """The guest's events as a calendar file: reminders a week, a day and two hours before."""
    download = service.calendar_file(db, token, settings.public_app_url, event)
    return Response(
        content=download.content,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{download.filename}"',
            "Cache-Control": "no-store",
        },
    )
