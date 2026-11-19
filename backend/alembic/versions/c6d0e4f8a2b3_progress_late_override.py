"""progress_notes: Finishing's own count for the Tiến độ "late" column

Revision ID: c6d0e4f8a2b3
Revises: b5c9d3e7f1a2
Create Date: 2026-11-19 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c6d0e4f8a2b3'
down_revision: Union[str, None] = 'b5c9d3e7f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('progress_notes', sa.Column('late_override', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('progress_notes', 'late_override')
