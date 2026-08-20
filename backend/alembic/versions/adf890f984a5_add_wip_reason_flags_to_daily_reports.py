"""add wip reason flags to daily_reports

Revision ID: adf890f984a5
Revises: ab079b4d041b
Create Date: 2026-08-20 11:07:50.809997

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'adf890f984a5'
down_revision: Union[str, None] = 'ab079b4d041b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'daily_reports',
        sa.Column('wip_reason_machine', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'daily_reports',
        sa.Column('wip_reason_line_spread', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'daily_reports',
        sa.Column('wip_reason_semi_finished', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('daily_reports', 'wip_reason_semi_finished')
    op.drop_column('daily_reports', 'wip_reason_line_spread')
    op.drop_column('daily_reports', 'wip_reason_machine')
