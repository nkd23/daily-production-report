"""close_order_items: Finishing's corrected Pack-Cut

Revision ID: b5c9d3e7f1a2
Revises: a4b8c2d6e0f1
Create Date: 2026-11-19 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b5c9d3e7f1a2'
down_revision: Union[str, None] = 'a4b8c2d6e0f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('close_order_items', sa.Column('pack_cut_override', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('close_order_items', 'pack_cut_override')
