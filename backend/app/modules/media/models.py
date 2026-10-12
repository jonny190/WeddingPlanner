import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TenantScoped, TimestampMixin


class MediaAsset(IdMixin, TimestampMixin, TenantScoped, Base):
    """An uploaded image, e.g. artwork used in an invitation design."""

    __tablename__ = "media_assets"

    wedding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("weddings.id", ondelete="CASCADE"), index=True
    )
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column()
    storage_key: Mapped[str] = mapped_column(String(255), unique=True)
