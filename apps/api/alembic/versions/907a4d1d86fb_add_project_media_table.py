"""add project_media table

Revision ID: 907a4d1d86fb
Revises: j0k1l2m3n4o5
Create Date: 2026-06-30 13:03:11.484730

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '907a4d1d86fb'
down_revision: Union[str, None] = 'j0k1l2m3n4o5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('project_media',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('storage_key', sa.String(length=1000), nullable=False),
        sa.Column('thumb_key', sa.String(length=1000), nullable=True),
        sa.Column('file_name', sa.String(length=500), nullable=False),
        sa.Column('media_type', sa.String(length=20), nullable=False),
        sa.Column('file_size_bytes', sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_project_media_project_id'), 'project_media', ['project_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_project_media_project_id'), table_name='project_media')
    op.drop_table('project_media')
