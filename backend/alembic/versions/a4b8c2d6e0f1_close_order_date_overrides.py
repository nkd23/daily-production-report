"""close_order_items: Finishing's corrected End Sew / End Pack

Revision ID: a4b8c2d6e0f1
Revises: f3a7b1c5d9e0
Create Date: 2026-11-19 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a4b8c2d6e0f1'
down_revision: Union[str, None] = 'f3a7b1c5d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('close_order_items', sa.Column('end_sew_override', sa.Date(), nullable=True))
    op.add_column('close_order_items', sa.Column('end_pack_override', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('close_order_items', 'end_pack_override')
    op.drop_column('close_order_items', 'end_sew_override')
