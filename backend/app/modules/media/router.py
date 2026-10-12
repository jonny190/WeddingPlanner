import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, UploadFile, status
from fastapi.responses import Response

from app.core.errors import BadRequest
from app.modules.media import service
from app.modules.media.schemas import MediaAssetRead, UploadLimits
from app.modules.media.storage import MediaStorage
from app.modules.tenancy.deps import DB, AppSettings, CurrentTenant, EditorTenant


def get_media_storage(request: Request) -> MediaStorage:
    return request.app.state.media_storage


Storage = Annotated[MediaStorage, Depends(get_media_storage)]

router = APIRouter(prefix="/weddings/{wedding_id}/media", tags=["Media"])
public_router = APIRouter(prefix="/media", tags=["Public media"])


@router.get("", response_model=list[MediaAssetRead])
def list_assets(wedding_id: uuid.UUID, db: DB, _ctx: CurrentTenant):
    return service.list_assets(db, wedding_id)


@router.get("/limits", response_model=UploadLimits)
def upload_limits(wedding_id: uuid.UUID, settings: AppSettings, _ctx: CurrentTenant):
    return UploadLimits(max_bytes=settings.max_upload_bytes, content_types=list(service.EXTENSIONS))


@router.post("", response_model=MediaAssetRead, status_code=status.HTTP_201_CREATED)
async def upload_asset(
    wedding_id: uuid.UUID,
    file: UploadFile,
    db: DB,
    storage: Storage,
    settings: AppSettings,
    ctx: EditorTenant,
):
    data = await file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        limit_mb = settings.max_upload_bytes // (1024 * 1024)
        raise BadRequest(f"Images must be smaller than {limit_mb} MB", code="file_too_large")
    return service.upload_asset(db, storage, ctx.tenant_id, wedding_id, file.filename, data)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    wedding_id: uuid.UUID, asset_id: uuid.UUID, db: DB, storage: Storage, _ctx: EditorTenant
):
    service.delete_asset(db, storage, wedding_id, asset_id)


@public_router.get("/{asset_id}", response_class=Response)
def serve_asset(asset_id: uuid.UUID, db: DB, storage: Storage):
    """Images are addressed by an unguessable id so guests and email clients can load them."""
    asset, data = service.read_public_asset(db, storage, asset_id)
    return Response(
        content=data,
        media_type=asset.content_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'",
        },
    )
