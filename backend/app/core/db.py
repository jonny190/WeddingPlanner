"""Database primitives shared by every module.

Multi-tenancy is enforced here: any model that inherits ``TenantScoped`` is
automatically filtered to the tenant bound to the session (``bind_tenant``), and
new rows are stamped with that tenant on flush. Request handlers bind the tenant
once, after verifying the caller's membership, so module code never has to
remember to add ``WHERE tenant_id = ...`` itself.
"""

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from enum import StrEnum

from fastapi import Request
from sqlalchemy import JSON, DateTime, ForeignKey, MetaData, TypeDecorator, create_engine, event
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Engine
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    ORMExecuteState,
    Session,
    mapped_column,
    with_loader_criteria,
)

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

TENANT_KEY = "tenant_id"


def utcnow() -> datetime:
    return datetime.now(UTC)


def as_utc(value: datetime) -> datetime:
    """SQLite hands back naive datetimes; everything we store is UTC."""
    return value if value.tzinfo else value.replace(tzinfo=UTC)


class UTCDateTime(TypeDecorator):
    """A moment in time, always returned as an aware UTC datetime.

    SQLite drops the zone and PostgreSQL answers in the server's zone; normalise both.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_result_value(self, value, dialect):
        return as_utc(value).astimezone(UTC) if value is not None else None


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map = {datetime: UTCDateTime()}


class IdMixin:
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)


class TenantScoped:
    """Mixin for rows owned by a tenant."""

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )


# JSON documents, stored as JSONB on PostgreSQL.
JSONDocument = JSON().with_variant(JSONB(), "postgresql")


def enum_type(enum_cls: type[StrEnum]) -> SAEnum:
    """Store enums as plain strings so new values never need a DB type migration."""
    return SAEnum(
        enum_cls,
        native_enum=False,
        length=32,
        values_callable=lambda e: [m.value for m in e],
        validate_strings=True,
    )


def bind_tenant(session: Session, tenant_id: uuid.UUID) -> None:
    session.info[TENANT_KEY] = tenant_id


def unbind_tenant(session: Session) -> None:
    """Lift the tenant filter again, for the rare step that must see across accounts
    (listing every account a user belongs to after they accept an invitation)."""
    session.info.pop(TENANT_KEY, None)


@event.listens_for(Session, "do_orm_execute")
def _scope_to_tenant(state: ORMExecuteState) -> None:
    tenant_id = state.session.info.get(TENANT_KEY)
    if tenant_id is None:
        return
    if (
        (state.is_select or state.is_update or state.is_delete)
        and not state.is_column_load
        and not state.is_relationship_load
    ):
        state.statement = state.statement.options(
            with_loader_criteria(
                TenantScoped,
                lambda cls: cls.tenant_id == tenant_id,
                include_aliases=True,
            )
        )


@event.listens_for(Session, "before_flush")
def _stamp_tenant(session: Session, _flush_context, _instances) -> None:
    tenant_id = session.info.get(TENANT_KEY)
    if tenant_id is None:
        return
    for obj in session.new:
        if isinstance(obj, TenantScoped):
            if obj.tenant_id is None:
                obj.tenant_id = tenant_id
            elif obj.tenant_id != tenant_id:
                raise PermissionError("Refusing to write a row belonging to another tenant")
    for obj in session.dirty:
        if isinstance(obj, TenantScoped) and obj.tenant_id != tenant_id:
            raise PermissionError("Refusing to write a row belonging to another tenant")


def create_db_engine(url: str, **kwargs) -> Engine:
    if url.startswith("sqlite"):
        kwargs.setdefault("connect_args", {"check_same_thread": False})
        engine = create_engine(url, **kwargs)

        @event.listens_for(engine, "connect")
        def _enable_sqlite_fks(dbapi_conn, _record) -> None:
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine
    return create_engine(url, pool_pre_ping=True, **kwargs)


def get_db(request: Request) -> Iterator[Session]:
    db: Session = request.app.state.session_factory()
    try:
        yield db
    finally:
        db.close()
