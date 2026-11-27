"""close_order_items.pack_qty_override: Finishing's own Pack qty

Revision ID: b4d8f2a6c0e1
Revises: a3c7e1f5b9d2
Create Date: 2026-11-27 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b4d8f2a6c0e1'
down_revision: Union[str, None] = 'a3c7e1f5b9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('close_order_items', sa.Column('pack_qty_override', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('close_order_items', 'pack_qty_override')
