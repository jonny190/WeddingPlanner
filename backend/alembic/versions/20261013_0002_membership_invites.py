"""membership invites

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-13 09:26:04.311616
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "membership_invites",
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "owner", "admin", "editor", "viewer", name="role", native_enum=False, length=32
            ),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("invited_by_id", sa.Uuid(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["invited_by_id"],
            ["users.id"],
            name=op.f("fk_membership_invites_invited_by_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name=op.f("fk_membership_invites_tenant_id_tenants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_membership_invites")),
        sa.UniqueConstraint(
            "tenant_id", "email", name=op.f("uq_membership_invites_tenant_id_email")
        ),
        sa.UniqueConstraint("token_hash", name=op.f("uq_membership_invites_token_hash")),
    )
    op.create_index(
        op.f("ix_membership_invites_tenant_id"), "membership_invites", ["tenant_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_membership_invites_tenant_id"), table_name="membership_invites")
    op.drop_table("membership_invites")
