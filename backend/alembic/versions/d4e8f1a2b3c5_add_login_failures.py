"""add login_failures for login throttling

Revision ID: d4e8f1a2b3c5
Revises: c3d1e7a4b902
Create Date: 2026-10-07 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e8f1a2b3c5'
down_revision: Union[str, None] = 'c3d1e7a4b902'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'login_failures',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('throttle_key', sa.Unicode(length=200), nullable=False),
        sa.Column('failed_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_login_failures_throttle_key', 'login_failures', ['throttle_key'])
    op.create_index('ix_login_failures_failed_at', 'login_failures', ['failed_at'])


def downgrade() -> None:
    op.drop_index('ix_login_failures_failed_at', table_name='login_failures')
    op.drop_index('ix_login_failures_throttle_key', table_name='login_failures')
    op.drop_table('login_failures')
