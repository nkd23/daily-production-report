"""add progress_overrides (Manager corrections to Tiến độ quantities)

Revision ID: c9d3e7f1a5b6
Revises: b8c2d6e0f4a5
Create Date: 2026-11-10 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c9d3e7f1a5b6'
down_revision: Union[str, None] = 'b8c2d6e0f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'progress_overrides',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('order_key', sa.Unicode(200), nullable=False),
        sa.Column('field', sa.Unicode(20), nullable=False),
        sa.Column('value', sa.Integer(), nullable=False),
        sa.Column('base_value', sa.Integer(), nullable=True),
        sa.Column('set_by', sa.Unicode(100), nullable=True),
        sa.Column('set_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('order_key', 'field', name='uq_progress_override_key_field'),
    )


def downgrade() -> None:
    op.drop_table('progress_overrides')
