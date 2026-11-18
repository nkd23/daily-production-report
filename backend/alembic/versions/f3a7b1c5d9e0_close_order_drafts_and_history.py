"""close order: Thursday-morning drafts and the 6-week history

Revision ID: f3a7b1c5d9e0
Revises: e2f6a0b4c8d9
Create Date: 2026-11-18 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f3a7b1c5d9e0'
down_revision: Union[str, None] = 'e2f6a0b4c8d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Weeks that already exist were all published.
    op.add_column(
        'close_order_weeks',
        sa.Column('is_published', sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        'close_order_reported_jos',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('jo', sa.Unicode(50), nullable=False, unique=True),
        sa.Column('week_start', sa.Date(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('close_order_reported_jos')
    op.drop_column('close_order_weeks', 'is_published')
