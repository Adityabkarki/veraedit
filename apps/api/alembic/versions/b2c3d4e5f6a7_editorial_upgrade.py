"""Editorial upgrade: scene_kind, thumbnails, highlights table.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-30
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "scenes",
        sa.Column("scene_kind", sa.String(length=20), nullable=False, server_default="chapter"),
    )
    op.add_column("scenes", sa.Column("thumbnail_url", sa.Text(), nullable=True))
    op.create_index("ix_scenes_scene_kind", "scenes", ["scene_kind"], unique=False)

    op.create_table(
        "highlights",
        sa.Column("asset_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("start_time", sa.Float(), nullable=False),
        sa.Column("end_time", sa.Float(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("promo_copy_en", sa.Text(), nullable=True),
        sa.Column("promo_caption_ne", sa.Text(), nullable=True),
        sa.Column("highlight_score", sa.Float(), nullable=True),
        sa.Column("platform_packs", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("thumbnail_url", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="detected",
        ),
        sa.Column("superseded", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_highlights_asset_id", "highlights", ["asset_id"], unique=False)
    op.create_index("ix_highlights_project_id", "highlights", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_highlights_project_id", table_name="highlights")
    op.drop_index("ix_highlights_asset_id", table_name="highlights")
    op.drop_table("highlights")
    op.drop_index("ix_scenes_scene_kind", table_name="scenes")
    op.drop_column("scenes", "thumbnail_url")
    op.drop_column("scenes", "scene_kind")
