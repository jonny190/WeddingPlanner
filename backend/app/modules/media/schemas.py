import uuid
from datetime import datetime

from pydantic import BaseModel, computed_field

from app.core.schemas import ORMModel


def media_path(asset_id: uuid.UUID) -> str:
    """Public, unauthenticated path for an asset (guests' browsers and email clients load it)."""
    return f"/api/v1/public/media/{asset_id}"


class MediaAssetRead(ORMModel):
    id: uuid.UUID
    wedding_id: uuid.UUID
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime

    @computed_field
    @property
    def url(self) -> str:
        return media_path(self.id)


class UploadLimits(BaseModel):
    max_bytes: int
    content_types: list[str]
