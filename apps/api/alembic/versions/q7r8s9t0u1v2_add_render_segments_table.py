"""add render_segments table for chunked long-form renders

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-07-06
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "q7r8s9t0u1v2"
down_revision = "p6q7r8s9t0u1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    render_segment_status = postgresql.ENUM(
        "pending",
        "rendering",
        "complete",
        "failed",
        name="render_segment_status_enum",
        # Created explicitly below; create_type=False stops create_table from
        # emitting a second CREATE TYPE in the same transaction.
        create_type=False,
    )
    render_segment_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "render_segments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("render_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("segment_index", sa.Integer(), nullable=False),
        sa.Column("start_frame", sa.Integer(), nullable=False),
        sa.Column("end_frame", sa.Integer(), nullable=False),
        sa.Column("status", render_segment_status, nullable=False, server_default="pending"),
        sa.Column("output_storage_key", sa.String(length=1000), nullable=True),
        sa.Column("error_message", sa.String(length=2000), nullable=True),
        sa.Column("celery_task_id", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["render_id"], ["renders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_render_segments_render_id", "render_segments", ["render_id"])
    op.create_index("ix_render_segments_status", "render_segments", ["status"])


def downgrade() -> None:
    op.drop_index("ix_render_segments_status", table_name="render_segments")
    op.drop_index("ix_render_segments_render_id", table_name="render_segments")
    op.drop_table("render_segments")
    sa.Enum(name="render_segment_status_enum").drop(op.get_bind(), checkfirst=True)
