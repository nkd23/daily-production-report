"""close_order_items: Finishing's late overrides and removal

Revision ID: e2f6a0b4c8d9
Revises: d1e5f9a3b7c8
Create Date: 2026-11-18 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e2f6a0b4c8d9'
down_revision: Union[str, None] = 'd1e5f9a3b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('close_order_items', sa.Column('duration_override', sa.Integer(), nullable=True))
    op.add_column('close_order_items', sa.Column('late_override', sa.Boolean(), nullable=True))
    op.add_column(
        'close_order_items',
        sa.Column('is_removed', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column('close_order_items', sa.Column('removed_by', sa.Unicode(100), nullable=True))
    op.add_column('close_order_items', sa.Column('removed_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('close_order_items', 'removed_at')
    op.drop_column('close_order_items', 'removed_by')
    op.drop_column('close_order_items', 'is_removed')
    op.drop_column('close_order_items', 'late_override')
    op.drop_column('close_order_items', 'duration_override')
