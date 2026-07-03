"""add asset edit proxy columns

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-07-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "n4o5p6q7r8s9"
down_revision = "m3n4o5p6q7r8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assets",
        sa.Column("proxy_storage_key", sa.String(length=1000), nullable=True),
    )
    op.add_column(
        "assets",
        sa.Column("proxy_file_size", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "assets",
        sa.Column(
            "proxy_status",
            sa.String(length=32),
            nullable=True,
            server_default=None,
        ),
    )


def downgrade() -> None:
    op.drop_column("assets", "proxy_status")
    op.drop_column("assets", "proxy_file_size")
    op.drop_column("assets", "proxy_storage_key")
