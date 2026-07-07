"""add audio_analysis_records and timeline_entry_index tables

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-07-06
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "p6q7r8s9t0u1"
down_revision = "o5p6q7r8s9t0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audio_analysis_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("project_id", sa.String(length=64), nullable=False),
        sa.Column("source_hash", sa.String(length=32), nullable=False),
        sa.Column("storage_key", sa.String(length=1000), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("fps", sa.Integer(), nullable=False),
        sa.Column("frame_count", sa.Integer(), nullable=False),
        sa.Column("band_count", sa.Integer(), nullable=False),
        sa.Column("peak_amplitude", sa.Float(), nullable=False),
        sa.Column("storage_format", sa.String(length=16), nullable=False, server_default="binary"),
        sa.Column("meta_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audio_analysis_records_project_id", "audio_analysis_records", ["project_id"])
    op.create_index("ix_audio_analysis_records_source_hash", "audio_analysis_records", ["source_hash"])

    op.create_table(
        "timeline_entry_index",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("timeline_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("track_name", sa.String(length=32), nullable=False),
        sa.Column("entry_id", sa.String(length=128), nullable=False),
        sa.Column("start_frame", sa.Integer(), nullable=False),
        sa.Column("end_frame", sa.Integer(), nullable=False),
        sa.Column("entry_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.ForeignKeyConstraint(["timeline_id"], ["director_timelines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_timeline_entry_index_timeline_id", "timeline_entry_index", ["timeline_id"])
    op.create_index("ix_timeline_entry_index_track_name", "timeline_entry_index", ["track_name"])
    op.create_index("ix_timeline_entry_index_start_frame", "timeline_entry_index", ["start_frame"])
    op.create_index("ix_timeline_entry_index_end_frame", "timeline_entry_index", ["end_frame"])


def downgrade() -> None:
    op.drop_index("ix_timeline_entry_index_end_frame", table_name="timeline_entry_index")
    op.drop_index("ix_timeline_entry_index_start_frame", table_name="timeline_entry_index")
    op.drop_index("ix_timeline_entry_index_track_name", table_name="timeline_entry_index")
    op.drop_index("ix_timeline_entry_index_timeline_id", table_name="timeline_entry_index")
    op.drop_table("timeline_entry_index")
    op.drop_index("ix_audio_analysis_records_source_hash", table_name="audio_analysis_records")
    op.drop_index("ix_audio_analysis_records_project_id", table_name="audio_analysis_records")
    op.drop_table("audio_analysis_records")
