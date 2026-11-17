"""add Close order tables, holidays, and the finishing role

Revision ID: d1e5f9a3b7c8
Revises: c9d3e7f1a5b6
Create Date: 2026-11-17 21:45:00.000000

"""
from datetime import date
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd1e5f9a3b7c8'
down_revision: Union[str, None] = 'c9d3e7f1a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# From the "exe" sheet of the old Close Order Report.
HOLIDAYS = [
    (date(2026, 1, 1), "Tết Dương lịch"),
    (date(2026, 2, 16), "Tết Nguyên đán"),
    (date(2026, 2, 17), "Tết Nguyên đán"),
    (date(2026, 2, 18), "Tết Nguyên đán"),
    (date(2026, 2, 19), "Tết Nguyên đán"),
    (date(2026, 2, 20), "Tết Nguyên đán"),
    (date(2026, 2, 21), "Tết Nguyên đán"),
    (date(2026, 9, 2), "Quốc khánh"),
    (date(2026, 9, 3), "Quốc khánh"),
]


def upgrade() -> None:
    # users.role is a native enum on PostgreSQL (Supabase) but a plain
    # VARCHAR(9) on SQL Server, where "finishing" already fits.
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'finishing'")

    op.create_table(
        'close_order_rows',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('source_file', sa.Unicode(255), nullable=False),
        sa.Column('line_number', sa.Unicode(20), nullable=False),
        sa.Column('jo', sa.Unicode(50), nullable=False),
        sa.Column('color', sa.Unicode(100), nullable=True),
        sa.Column('buyer', sa.Unicode(100), nullable=True),
        sa.Column('bpo_date', sa.Unicode(40), nullable=True),
        sa.Column('shipment_plan', sa.Unicode(40), nullable=True),
        sa.Column('end_sew', sa.Unicode(40), nullable=True),
        sa.Column('end_pack', sa.Unicode(40), nullable=True),
        sa.Column('order_qty', sa.Integer(), nullable=True),
        sa.Column('cut_qty', sa.Integer(), nullable=True),
        sa.Column('sew_qty', sa.Integer(), nullable=True),
        sa.Column('pack_qty', sa.Integer(), nullable=True),
        sa.Column('pack_cut', sa.Integer(), nullable=True),
        sa.Column('product_category', sa.Unicode(50), nullable=True),
    )
    op.create_index('ix_close_order_rows_source_file', 'close_order_rows', ['source_file'])
    op.create_table(
        'close_order_weeks',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('week_start', sa.Date(), nullable=False, unique=True),
        sa.Column('published_at', sa.DateTime(), nullable=False),
        sa.Column('imported', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('source_errors', sa.UnicodeText(), nullable=True),
    )
    op.create_table(
        'close_order_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('week_start', sa.Date(), nullable=False),
        sa.Column('line_number', sa.Unicode(20), nullable=False),
        sa.Column('jo', sa.Unicode(50), nullable=False),
        sa.Column('buyer', sa.Unicode(100), nullable=True),
        sa.Column('color_count', sa.Integer(), nullable=True),
        sa.Column('order_qty', sa.Integer(), nullable=True),
        sa.Column('cut_qty', sa.Integer(), nullable=True),
        sa.Column('sew_qty', sa.Integer(), nullable=True),
        sa.Column('pack_qty', sa.Integer(), nullable=True),
        sa.Column('pack_cut', sa.Integer(), nullable=True),
        sa.Column('bpo_date', sa.Unicode(40), nullable=True),
        sa.Column('exfty_date', sa.Unicode(40), nullable=True),
        sa.Column('end_sew', sa.Date(), nullable=False),
        sa.Column('end_pack', sa.Unicode(40), nullable=True),
        sa.Column('product_category', sa.Unicode(50), nullable=True),
        sa.Column('wf', sa.Boolean(), nullable=True),
        sa.Column('remark', sa.UnicodeText(), nullable=True),
        sa.Column('department', sa.Unicode(30), nullable=True),
        sa.Column('source', sa.Unicode(10), nullable=False, server_default='web'),
        sa.Column('updated_by', sa.Unicode(100), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_close_order_items_week_start', 'close_order_items', ['week_start'])
    op.create_index('ix_close_order_items_jo', 'close_order_items', ['jo'])
    holidays = op.create_table(
        'holidays',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('day', sa.Date(), nullable=False, unique=True),
        sa.Column('name', sa.Unicode(100), nullable=True),
    )
    op.bulk_insert(holidays, [{"day": d, "name": n} for d, n in HOLIDAYS])


def downgrade() -> None:
    op.drop_table('holidays')
    op.drop_index('ix_close_order_items_jo', table_name='close_order_items')
    op.drop_index('ix_close_order_items_week_start', table_name='close_order_items')
    op.drop_table('close_order_items')
    op.drop_table('close_order_weeks')
    op.drop_index('ix_close_order_rows_source_file', table_name='close_order_rows')
    op.drop_table('close_order_rows')
    # PostgreSQL cannot drop an enum value; "finishing" stays in userrole.
