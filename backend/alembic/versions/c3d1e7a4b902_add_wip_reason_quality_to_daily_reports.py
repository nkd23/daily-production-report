"""add wip_reason_quality to daily_reports

Revision ID: c3d1e7a4b902
Revises: adf890f984a5
Create Date: 2026-10-07 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d1e7a4b902'
down_revision: Union[str, None] = 'adf890f984a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'daily_reports',
        sa.Column('wip_reason_quality', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('daily_reports', 'wip_reason_quality')
