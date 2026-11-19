"""close_order_items: "Tồn tuần trước" flag

Revision ID: d7e1f5a9b3c4
Revises: c6d0e4f8a2b3
Create Date: 2026-11-19 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd7e1f5a9b3c4'
down_revision: Union[str, None] = 'c6d0e4f8a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'close_order_items',
        sa.Column('is_carry', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('close_order_items', 'is_carry')
