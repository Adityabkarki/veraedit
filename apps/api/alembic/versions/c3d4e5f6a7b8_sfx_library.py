"""sfx_library catalog table

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-07
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sfx_library",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("slug", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("file_name", sa.String(128), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("mixkit_id", sa.Integer(), nullable=True),
        sa.Column("license_name", sa.String(64), nullable=False, server_default="Mixkit"),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("tool_ids", postgresql.ARRAY(sa.String()), nullable=True),
    )
    op.create_index("ix_sfx_library_slug", "sfx_library", ["slug"], unique=True)
    op.create_index("ix_sfx_library_category", "sfx_library", ["category"])


def downgrade() -> None:
    op.drop_index("ix_sfx_library_category", table_name="sfx_library")
    op.drop_index("ix_sfx_library_slug", table_name="sfx_library")
    op.drop_table("sfx_library")
