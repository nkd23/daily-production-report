"""add progress_sources / progress_orders / progress_notes (Tiến độ đơn hàng)

Revision ID: b8c2d6e0f4a5
Revises: a7b1c5d9e3f4
Create Date: 2026-11-10 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8c2d6e0f4a5'
down_revision: Union[str, None] = 'a7b1c5d9e3f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'progress_sources',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('file_name', sa.Unicode(255), nullable=False, unique=True),
        sa.Column('kind', sa.Unicode(20), nullable=False),
        sa.Column('owner', sa.Unicode(100), nullable=False),
        sa.Column('file_modified_at', sa.DateTime(), nullable=True),
        sa.Column('last_attempt_at', sa.DateTime(), nullable=False),
        sa.Column('last_ok_at', sa.DateTime(), nullable=True),
        sa.Column('last_error', sa.UnicodeText(), nullable=True),
        sa.Column('row_count', sa.Integer(), nullable=False),
    )
    op.create_table(
        'progress_orders',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('source_file', sa.Unicode(255), nullable=False),
        sa.Column('order_key', sa.Unicode(200), nullable=False),
        sa.Column('line_number', sa.Unicode(20), nullable=False),
        sa.Column('line_raw', sa.Unicode(50), nullable=True),
        sa.Column('buyer', sa.Unicode(100), nullable=True),
        sa.Column('jo', sa.Unicode(50), nullable=False),
        sa.Column('color', sa.Unicode(100), nullable=True),
        sa.Column('bpo_date', sa.Unicode(40), nullable=True),
        sa.Column('shipment_plan', sa.Unicode(40), nullable=True),
        sa.Column('order_carton', sa.Unicode(40), nullable=True),
        sa.Column('start_sew', sa.Unicode(40), nullable=True),
        sa.Column('end_sew', sa.Unicode(40), nullable=True),
        sa.Column('end_pack', sa.Unicode(40), nullable=True),
        sa.Column('order_qty', sa.Integer(), nullable=True),
        sa.Column('allocate_qty', sa.Integer(), nullable=True),
        sa.Column('cut_qty', sa.Integer(), nullable=True),
        sa.Column('sew_qty', sa.Integer(), nullable=True),
        sa.Column('pack_qty', sa.Integer(), nullable=True),
        sa.Column('pack_cut', sa.Integer(), nullable=False),
        sa.Column('product_category', sa.Unicode(50), nullable=True),
        sa.Column('cust_style_no', sa.Unicode(100), nullable=True),
    )
    op.create_index('ix_progress_orders_source_file', 'progress_orders', ['source_file'])
    op.create_index('ix_progress_orders_order_key', 'progress_orders', ['order_key'])
    op.create_table(
        'progress_notes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('order_key', sa.Unicode(200), nullable=False, unique=True),
        sa.Column('ex_remark', sa.UnicodeText(), nullable=True),
        sa.Column('fin_remark', sa.UnicodeText(), nullable=True),
        sa.Column('is_closed', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('closed_by', sa.Unicode(100), nullable=True),
        sa.Column('closed_at', sa.DateTime(), nullable=True),
        sa.Column('updated_by', sa.Unicode(100), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('progress_notes')
    op.drop_index('ix_progress_orders_order_key', table_name='progress_orders')
    op.drop_index('ix_progress_orders_source_file', table_name='progress_orders')
    op.drop_table('progress_orders')
    op.drop_table('progress_sources')
