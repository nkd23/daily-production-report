"""daily_reports.part: whole line (AB) or one half (A / B) of a split line

Revision ID: e8f2a6b0c4d5
Revises: d7e1f5a9b3c4
Create Date: 2026-11-23 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e8f2a6b0c4d5'
down_revision: Union[str, None] = 'd7e1f5a9b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Every existing report covered the whole line.
    op.add_column('daily_reports', sa.Column('part', sa.Unicode(2), nullable=False, server_default='AB'))
    op.add_column('report_history', sa.Column('part', sa.Unicode(2), nullable=False, server_default='AB'))
    op.drop_constraint('uq_line_date', 'daily_reports', type_='unique')
    op.create_unique_constraint('uq_line_date_part', 'daily_reports', ['line_id', 'report_date', 'part'])


def downgrade() -> None:
    op.drop_constraint('uq_line_date_part', 'daily_reports', type_='unique')
    op.execute("DELETE FROM daily_reports WHERE part <> 'AB'")
    op.create_unique_constraint('uq_line_date', 'daily_reports', ['line_id', 'report_date'])
    op.drop_column('report_history', 'part')
    op.drop_column('daily_reports', 'part')
