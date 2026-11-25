"""Zalo bot: the bot's small state table (group chat, sent alerts)

Revision ID: a3c7e1f5b9d2
Revises: e8f2a6b0c4d5
Create Date: 2026-11-25 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3c7e1f5b9d2'
down_revision: Union[str, None] = 'e8f2a6b0c4d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'zalo_state',
        sa.Column('key', sa.Unicode(100), primary_key=True),
        sa.Column('value', sa.UnicodeText(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('zalo_state')
