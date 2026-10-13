"""menus

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-13 11:19:03.592138
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "menu_courses",
        sa.Column("wedding_id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["events.id"],
            name=op.f("fk_menu_courses_event_id_events"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name=op.f("fk_menu_courses_tenant_id_tenants"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["wedding_id"],
            ["weddings.id"],
            name=op.f("fk_menu_courses_wedding_id_weddings"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_menu_courses")),
    )
    op.create_index(op.f("ix_menu_courses_event_id"), "menu_courses", ["event_id"], unique=False)
    op.create_index(op.f("ix_menu_courses_tenant_id"), "menu_courses", ["tenant_id"], unique=False)
    op.create_index(
        op.f("ix_menu_courses_wedding_id"), "menu_courses", ["wedding_id"], unique=False
    )

    op.create_table(
        "menu_options",
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["menu_courses.id"],
            name=op.f("fk_menu_options_course_id_menu_courses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name=op.f("fk_menu_options_tenant_id_tenants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_menu_options")),
    )
    op.create_index(op.f("ix_menu_options_course_id"), "menu_options", ["course_id"], unique=False)
    op.create_index(op.f("ix_menu_options_tenant_id"), "menu_options", ["tenant_id"], unique=False)

    op.create_table(
        "menu_choices",
        sa.Column("invitation_id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("option_id", sa.Uuid(), nullable=False),
        sa.Column("for_plus_one", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["menu_courses.id"],
            name=op.f("fk_menu_choices_course_id_menu_courses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["invitation_id"],
            ["event_invitations.id"],
            name=op.f("fk_menu_choices_invitation_id_event_invitations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["option_id"],
            ["menu_options.id"],
            name=op.f("fk_menu_choices_option_id_menu_options"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name=op.f("fk_menu_choices_tenant_id_tenants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_menu_choices")),
        sa.UniqueConstraint(
            "invitation_id",
            "course_id",
            "for_plus_one",
            name=op.f("uq_menu_choices_invitation_id_course_id_for_plus_one"),
        ),
    )
    op.create_index(op.f("ix_menu_choices_course_id"), "menu_choices", ["course_id"], unique=False)
    op.create_index(
        op.f("ix_menu_choices_invitation_id"), "menu_choices", ["invitation_id"], unique=False
    )
    op.create_index(op.f("ix_menu_choices_option_id"), "menu_choices", ["option_id"], unique=False)
    op.create_index(op.f("ix_menu_choices_tenant_id"), "menu_choices", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_table("menu_choices")
    op.drop_table("menu_options")
    op.drop_table("menu_courses")
