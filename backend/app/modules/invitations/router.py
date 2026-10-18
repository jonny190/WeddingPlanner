import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from app.core.ratelimit import PublicRequest, check_per_user
from app.modules.guests.schemas import BulkResult
from app.modules.invitations import service
from app.modules.invitations.design import FONT_CATALOG, FontOption
from app.modules.invitations.models import DeliveryStatus
from app.modules.invitations.rendering import PLACEHOLDERS
from app.modules.invitations.schemas import (
    ChannelsResponse,
    DeliveryRead,
    DraftCreate,
    DraftRead,
    DraftUpdate,
    LinkOpenResult,
    MarkSentRequest,
    Placeholder,
    PreviewRequest,
    PreviewResponse,
    SendRequest,
    SendResult,
    TestSendRequest,
)
from app.modules.notifications.whatsapp import WhatsAppBackend
from app.modules.tenancy.deps import DB, AppSettings, CurrentTenant, EditorTenant


def get_whatsapp_backend(request: Request) -> WhatsAppBackend | None:
    return request.app.state.whatsapp_backend


WhatsApp = Annotated[WhatsAppBackend | None, Depends(get_whatsapp_backend)]

router = APIRouter(tags=["Invitations"])
public_router = APIRouter(prefix="/links", tags=["Public RSVP"], dependencies=[PublicRequest])
drafts = "/weddings/{wedding_id}/events/{event_id}/invitation-drafts"


@router.get("/invitation-placeholders", response_model=list[Placeholder])
def list_placeholders(_ctx: CurrentTenant):
    """Markers that can be used in a draft's subject and body, e.g. {{first_name}}."""
    return [Placeholder(name=k, description=v) for k, v in PLACEHOLDERS.items()]


@router.get("/invitation-channels", response_model=ChannelsResponse)
def invitation_channels(settings: AppSettings, whatsapp: WhatsApp, _ctx: CurrentTenant):
    """Whether invitations can go by WhatsApp here, and whether the bridge is connected."""
    return service.channels(settings, whatsapp)


@router.get("/invitation-fonts", response_model=list[FontOption])
def list_fonts(_ctx: CurrentTenant):
    """Fonts available in the card designer (served by Google Fonts on the web)."""
    return FONT_CATALOG


@router.get(drafts, response_model=list[DraftRead])
def list_drafts(wedding_id: uuid.UUID, event_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    return service.list_drafts(db, wedding_id, event_id)


@router.post(drafts, response_model=DraftRead, status_code=status.HTTP_201_CREATED)
def create_draft(
    wedding_id: uuid.UUID, event_id: uuid.UUID, data: DraftCreate, db: DB, _ctx: EditorTenant
):
    return service.create_draft(db, wedding_id, event_id, data)


@router.get(f"{drafts}/{{draft_id}}", response_model=DraftRead)
def get_draft(
    wedding_id: uuid.UUID, event_id: uuid.UUID, draft_id: uuid.UUID, db: DB, _ctx: CurrentTenant
):
    return service.get_draft(db, wedding_id, event_id, draft_id)


@router.patch(f"{drafts}/{{draft_id}}", response_model=DraftRead)
def update_draft(
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    draft_id: uuid.UUID,
    data: DraftUpdate,
    db: DB,
    _ctx: EditorTenant,
):
    return service.update_draft(db, wedding_id, event_id, draft_id, data)


@router.delete(f"{drafts}/{{draft_id}}", status_code=status.HTTP_204_NO_CONTENT)
def delete_draft(
    wedding_id: uuid.UUID, event_id: uuid.UUID, draft_id: uuid.UUID, db: DB, _ctx: EditorTenant
):
    service.delete_draft(db, wedding_id, event_id, draft_id)


@router.post(f"{drafts}/{{draft_id}}/preview", response_model=PreviewResponse)
def preview_draft(
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    draft_id: uuid.UUID,
    data: PreviewRequest,
    db: DB,
    settings: AppSettings,
    _ctx: CurrentTenant,
):
    return service.preview_draft(db, wedding_id, event_id, draft_id, data, settings.public_app_url)


@router.post(f"{drafts}/{{draft_id}}/send", response_model=SendResult)
def send_draft(
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    draft_id: uuid.UUID,
    data: SendRequest,
    db: DB,
    settings: AppSettings,
    whatsapp: WhatsApp,
    ctx: EditorTenant,
):
    """Queue this draft for the chosen audience, by email, WhatsApp or WhatsApp with email as
    the fallback. Use dry_run to see who would receive it and how."""
    if not data.dry_run:
        ctx.require_send()
    return service.send_draft(
        db,
        wedding_id,
        event_id,
        draft_id,
        data,
        settings.public_app_url,
        whatsapp_enabled=whatsapp is not None,
        phone_region=settings.phone_region,
    )


@router.post(
    f"{drafts}/{{draft_id}}/send-test",
    response_model=DeliveryRead,
    status_code=status.HTTP_202_ACCEPTED,
)
def send_test(
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    draft_id: uuid.UUID,
    data: TestSendRequest,
    request: Request,
    db: DB,
    settings: AppSettings,
    whatsapp: WhatsApp,
    ctx: EditorTenant,
):
    # Test sends go to any address, so cap how many one person can fire off.
    ctx.require_send()
    check_per_user(request, "email", ctx.user_id, "rate_limit_email_per_hour", 3600)
    return service.send_test(
        db,
        wedding_id,
        event_id,
        draft_id,
        data.channel,
        str(data.email or data.phone),
        data.guest_id,
        settings.public_app_url,
        whatsapp_enabled=whatsapp is not None,
        phone_region=settings.phone_region,
    )


@router.post(
    "/weddings/{wedding_id}/events/{event_id}/invitations/mark-sent", response_model=BulkResult
)
def mark_sent(
    wedding_id: uuid.UUID,
    event_id: uuid.UUID,
    data: MarkSentRequest,
    db: DB,
    _ctx: EditorTenant,
):
    """Record invitations delivered by post or in person, so their RSVP link becomes active."""
    return BulkResult(affected=service.mark_sent(db, wedding_id, event_id, data.guest_ids))


@router.get("/weddings/{wedding_id}/deliveries", response_model=list[DeliveryRead])
def list_deliveries(
    wedding_id: uuid.UUID,
    db: DB,
    _ctx: CurrentTenant,
    event_id: uuid.UUID | None = None,
    status: DeliveryStatus | None = None,
):
    return service.list_deliveries(db, wedding_id, event_id=event_id, status=status)


@router.post(
    "/weddings/{wedding_id}/events/{event_id}/deliveries/retry-failed", response_model=BulkResult
)
def retry_failed(wedding_id: uuid.UUID, event_id: uuid.UUID, db: DB, ctx: EditorTenant):
    ctx.require_send()
    return BulkResult(affected=service.retry_failed(db, wedding_id, event_id))


@public_router.post("/{token}/open", response_model=LinkOpenResult)
def open_link(token: str, request: Request, db: DB):
    """Called by the web app when a guest follows the link in their invitation email."""
    return service.record_link_open(db, token, request.headers.get("user-agent"))
