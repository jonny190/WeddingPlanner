import uuid
from pathlib import PurePath

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import BadRequest, NotFound
from app.modules.media.models import MediaAsset
from app.modules.media.storage import MediaStorage
from app.modules.weddings.service import get_wedding

EXTENSIONS = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp"}


def sniff_image_type(data: bytes) -> str | None:
    """Identify the image format from its bytes, never trusting the uploaded filename.

    SVG is deliberately unsupported: it can carry scripts.
    """
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def list_assets(db: Session, wedding_id: uuid.UUID) -> list[MediaAsset]:
    get_wedding(db, wedding_id)
    return list(
        db.scalars(
            select(MediaAsset)
            .where(MediaAsset.wedding_id == wedding_id)
            .order_by(MediaAsset.created_at.desc())
        )
    )


def upload_asset(
    db: Session,
    storage: MediaStorage,
    tenant_id: uuid.UUID,
    wedding_id: uuid.UUID,
    filename: str | None,
    data: bytes,
) -> MediaAsset:
    get_wedding(db, wedding_id)
    content_type = sniff_image_type(data)
    if content_type is None:
        raise BadRequest("Please upload a PNG, JPEG, GIF or WebP image", code="unsupported_media")
    asset_id = uuid.uuid4()
    key = f"{tenant_id}/{asset_id}{EXTENSIONS[content_type]}"
    storage.save(key, data)
    asset = MediaAsset(
        id=asset_id,
        wedding_id=wedding_id,
        filename=PurePath(filename or "image").name[:255],
        content_type=content_type,
        size_bytes=len(data),
        storage_key=key,
    )
    db.add(asset)
    db.commit()
    return asset


def delete_asset(
    db: Session, storage: MediaStorage, wedding_id: uuid.UUID, asset_id: uuid.UUID
) -> None:
    asset = db.scalar(
        select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.wedding_id == wedding_id)
    )
    if asset is None:
        raise NotFound("Image not found")
    db.delete(asset)
    db.commit()
    storage.delete(asset.storage_key)


def require_assets(db: Session, wedding_id: uuid.UUID, asset_ids: set[uuid.UUID]) -> None:
    """Ensure every referenced image belongs to this wedding (and so to this tenant)."""
    if not asset_ids:
        return
    found = set(
        db.scalars(
            select(MediaAsset.id).where(
                MediaAsset.wedding_id == wedding_id, MediaAsset.id.in_(asset_ids)
            )
        )
    )
    if found != asset_ids:
        raise BadRequest("The design uses an image that does not belong to this wedding")


def read_public_asset(
    db: Session, storage: MediaStorage, asset_id: uuid.UUID
) -> tuple[MediaAsset, bytes]:
    asset = db.get(MediaAsset, asset_id)
    data = storage.read(asset.storage_key) if asset else None
    if asset is None or data is None:
        raise NotFound("Image not found")
    return asset, data
