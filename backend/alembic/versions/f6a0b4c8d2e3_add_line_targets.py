"""add line_targets (weekly targets set by Executive)

Revision ID: f6a0b4c8d2e3
Revises: e5f9a3b7c1d2
Create Date: 2026-10-13 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6a0b4c8d2e3'
down_revision: Union[str, None] = 'e5f9a3b7c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'line_targets',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('line_id', sa.Integer(), sa.ForeignKey('lines.id'), nullable=False),
        sa.Column('effective_from', sa.Date(), nullable=False),
        sa.Column('target_output', sa.Integer(), nullable=False),
        sa.Column('target_eff', sa.Numeric(6, 2), nullable=False),
        sa.Column('set_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('set_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.UniqueConstraint('line_id', 'effective_from', name='uq_line_target_from'),
    )
    op.create_index('ix_line_targets_line_id', 'line_targets', ['line_id'])


def downgrade() -> None:
    op.drop_index('ix_line_targets_line_id', table_name='line_targets')
    op.drop_table('line_targets')
