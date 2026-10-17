"""venues

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-17 15:40:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "venues",
        sa.Column("wedding_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "considering",
                "shortlisted",
                "booked",
                "declined",
                name="venuestatus",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("website", sa.String(length=500), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("price_per_head", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("deposit", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("price_notes", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name=op.f("fk_venues_tenant_id_tenants"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["wedding_id"],
            ["weddings.id"],
            name=op.f("fk_venues_wedding_id_weddings"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_venues")),
    )
    op.create_index(op.f("ix_venues_tenant_id"), "venues", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_venues_wedding_id"), "venues", ["wedding_id"], unique=False)

    op.create_table(
        "venue_contacts",
        sa.Column("venue_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("role", sa.String(length=120), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name=op.f("fk_venue_contacts_tenant_id_tenants"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["venue_id"],
            ["venues.id"],
            name=op.f("fk_venue_contacts_venue_id_venues"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_venue_contacts")),
    )
    op.create_index(
        op.f("ix_venue_contacts_tenant_id"), "venue_contacts", ["tenant_id"], unique=False
    )
    op.create_index(
        op.f("ix_venue_contacts_venue_id"), "venue_contacts", ["venue_id"], unique=False
    )

    # Batch mode because this adds a constraint to an existing table: SQLite (used for
    # development and the end-to-end tests) cannot ALTER constraints, so Alembic rebuilds the
    # table there; on PostgreSQL the same block issues ordinary ALTER statements.
    with op.batch_alter_table("events") as batch_op:
        batch_op.add_column(sa.Column("venue_id", sa.Uuid(), nullable=True))
        batch_op.create_index(op.f("ix_events_venue_id"), ["venue_id"], unique=False)
        batch_op.create_foreign_key(
            op.f("fk_events_venue_id_venues"), "venues", ["venue_id"], ["id"], ondelete="SET NULL"
        )


def downgrade() -> None:
    with op.batch_alter_table("events") as batch_op:
        batch_op.drop_constraint(op.f("fk_events_venue_id_venues"), type_="foreignkey")
        batch_op.drop_index(op.f("ix_events_venue_id"))
        batch_op.drop_column("venue_id")
    op.drop_table("venue_contacts")
    op.drop_table("venues")
