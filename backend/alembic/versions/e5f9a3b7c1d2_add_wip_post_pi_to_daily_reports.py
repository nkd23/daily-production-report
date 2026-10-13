"""add wip_post_pi (Tồn sau PI) to daily_reports

Revision ID: e5f9a3b7c1d2
Revises: d4e8f1a2b3c5
Create Date: 2026-10-13 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5f9a3b7c1d2'
down_revision: Union[str, None] = 'd4e8f1a2b3c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable: reports submitted before this field existed have no value.
    op.add_column('daily_reports', sa.Column('wip_post_pi', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('daily_reports', 'wip_post_pi')
