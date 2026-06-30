"""add GENERATE_SIZZLE job type

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-06-30
"""
from __future__ import annotations

from alembic import op

revision = "k1l2m3n4o5p6"
down_revision = "907a4d1d86fb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            ALTER TYPE job_type_enum ADD VALUE 'GENERATE_SIZZLE';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)


def downgrade() -> None:
    pass
