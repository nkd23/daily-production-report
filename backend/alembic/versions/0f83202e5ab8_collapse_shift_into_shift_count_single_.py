"""collapse shift into shift_count, single row per line/date

The Tổ trưởng used to submit up to 2 daily_reports rows per line/date (one
per shift tab), which the app then summed/averaged together. The factory's
own sheet never worked that way - it has one row per line per day with a
plain "tổng số Ca" (shift count) column - so this collapses the model to
match: one row per (line_id, report_date), with shift_count entered
directly instead of inferred from how many rows exist.

Revision ID: 0f83202e5ab8
Revises: 0874f3834540
Create Date: 2026-08-14 14:36:01.251661

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0f83202e5ab8'
down_revision: Union[str, None] = '0874f3834540'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _sum_or_none(values):
    values = [v for v in values if v is not None]
    return sum(values) if values else None


def _avg_or_none(values):
    values = [v for v in values if v is not None]
    return (sum(values) / len(values)) if values else None


def _last_non_null(values):
    for v in reversed(values):
        if v is not None:
            return v
    return None


def upgrade() -> None:
    op.add_column('daily_reports', sa.Column('shift_count', sa.SmallInteger(), nullable=True))

    conn = op.get_bind()

    # Merge any line/date that still has more than one shift-row (pre-existing
    # data from the old Ca 1/Ca 2 submission model) into a single row, using
    # the same combining rules the app itself used to apply at read time:
    # quantities summed, efficiencies averaged, stock levels/buyer/targets
    # taken from the latest shift, issue notes concatenated.
    dup_groups = conn.execute(sa.text(
        "SELECT line_id, report_date FROM daily_reports GROUP BY line_id, report_date HAVING COUNT(*) > 1"
    )).fetchall()

    for line_id, report_date in dup_groups:
        rows = conn.execute(
            sa.text(
                "SELECT id, shift, buyer, sam, target_output, target_eff, out_sew, eff_sew, "
                "out_fin_scanpack, out_fin_fin, eff_fin, wip_dip, wip_pre_pi, issue_note, "
                "is_submitted, is_locked, secretary_override "
                "FROM daily_reports WHERE line_id = :line_id AND report_date = :report_date ORDER BY shift"
            ),
            {"line_id": line_id, "report_date": report_date},
        ).fetchall()

        survivor_id = rows[-1].id  # keep the later-shift row, delete the rest
        other_ids = [r.id for r in rows[:-1]]

        conn.execute(
            sa.text(
                "UPDATE daily_reports SET "
                "out_sew=:out_sew, out_fin_scanpack=:out_fin_scanpack, out_fin_fin=:out_fin_fin, "
                "eff_sew=:eff_sew, eff_fin=:eff_fin, wip_dip=:wip_dip, wip_pre_pi=:wip_pre_pi, "
                "buyer=:buyer, sam=:sam, target_output=:target_output, target_eff=:target_eff, "
                "issue_note=:issue_note, is_submitted=:is_submitted, is_locked=:is_locked, "
                "secretary_override=:secretary_override, shift_count=:shift_count "
                "WHERE id=:id"
            ),
            {
                "out_sew": _sum_or_none([r.out_sew for r in rows]),
                "out_fin_scanpack": _sum_or_none([r.out_fin_scanpack for r in rows]),
                "out_fin_fin": _sum_or_none([r.out_fin_fin for r in rows]),
                "eff_sew": _avg_or_none([r.eff_sew for r in rows]),
                "eff_fin": _avg_or_none([r.eff_fin for r in rows]),
                "wip_dip": _last_non_null([r.wip_dip for r in rows]),
                "wip_pre_pi": _last_non_null([r.wip_pre_pi for r in rows]),
                "buyer": _last_non_null([r.buyer for r in rows]),
                "sam": _last_non_null([r.sam for r in rows]),
                "target_output": _last_non_null([r.target_output for r in rows]),
                "target_eff": _last_non_null([r.target_eff for r in rows]),
                "issue_note": " | ".join([r.issue_note for r in rows if r.issue_note]) or None,
                "is_submitted": any(r.is_submitted for r in rows),
                "is_locked": all(r.is_locked for r in rows),
                "secretary_override": any(r.secretary_override for r in rows),
                "shift_count": len(rows),
                "id": survivor_id,
            },
        )

        if other_ids:
            conn.execute(
                sa.text("DELETE FROM daily_reports WHERE id IN :ids").bindparams(
                    sa.bindparam("ids", expanding=True)
                ),
                {"ids": other_ids},
            )

    # Every remaining (now-single) row predates this feature, so its true
    # shift count was never recorded - default to 1 rather than guess higher.
    conn.execute(sa.text("UPDATE daily_reports SET shift_count = 1 WHERE shift_count IS NULL"))

    op.alter_column('daily_reports', 'shift_count', existing_type=sa.SmallInteger(), nullable=False)
    op.drop_constraint('uq_line_date_shift', 'daily_reports', type_='unique')
    op.create_unique_constraint('uq_line_date', 'daily_reports', ['line_id', 'report_date'])
    op.drop_column('daily_reports', 'shift')

    op.drop_column('report_history', 'shift')


def downgrade() -> None:
    # Best-effort only: the shift=1/shift=2 split that upgrade() merged away
    # cannot be reconstructed, so every row becomes a single shift=1 row.
    op.add_column('report_history', sa.Column('shift', sa.SmallInteger(), nullable=False, server_default='1'))
    op.add_column('daily_reports', sa.Column('shift', sa.SmallInteger(), nullable=True))
    op.execute("UPDATE daily_reports SET shift = 1")
    op.alter_column('daily_reports', 'shift', existing_type=sa.SmallInteger(), nullable=False)
    op.drop_constraint('uq_line_date', 'daily_reports', type_='unique')
    op.create_unique_constraint('uq_line_date_shift', 'daily_reports', ['line_id', 'report_date', 'shift'])
    op.drop_column('daily_reports', 'shift_count')
