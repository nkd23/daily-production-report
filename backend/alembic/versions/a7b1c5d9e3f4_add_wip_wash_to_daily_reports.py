"""add wip_wash (Tồn giặt) to daily_reports

Split out of the combined "Tồn Dip/Giặt" field; wip_dip is Tồn Dip only from
here on. Older reports keep their value in wip_dip and have no wip_wash.

Revision ID: a7b1c5d9e3f4
Revises: f6a0b4c8d2e3
Create Date: 2026-10-13 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7b1c5d9e3f4'
down_revision: Union[str, None] = 'f6a0b4c8d2e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('daily_reports', sa.Column('wip_wash', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('daily_reports', 'wip_wash')
