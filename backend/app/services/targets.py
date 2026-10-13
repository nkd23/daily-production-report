"""Standing targets and carry-forward defaults for the entry form.

Targets live in line_targets (one row per change, effective_from onward) and
are set by Executive / Thư ký / Manager. Every daily_reports row carries a
copy of the target in force on its date, which is what the dashboard, VAR and
Excel export read - so changing a target from day D rewrites only the reports
from D up to the line's next change, and earlier days keep the target they
were judged against.

Before a line has any line_targets row, the target falls back to the line's
latest report that has one (the per-day targets entered before this feature).
"""

from datetime import date

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import DailyReport, Line, LineTarget, User


def _latest_set(db: Session, line_id: int, day: date) -> LineTarget | None:
    return db.scalar(
        select(LineTarget)
        .where(LineTarget.line_id == line_id, LineTarget.effective_from <= day)
        .order_by(LineTarget.effective_from.desc())
        .limit(1)
    )


def _latest_report_target(db: Session, line_id: int, day: date) -> DailyReport | None:
    return db.scalar(
        select(DailyReport)
        .where(
            DailyReport.line_id == line_id,
            DailyReport.report_date <= day,
            # Only real submissions - abandoned drafts can hold junk targets.
            DailyReport.is_submitted == True,  # noqa: E712
            DailyReport.target_output.is_not(None),
            DailyReport.target_eff.is_not(None),
        )
        .order_by(DailyReport.report_date.desc())
        .limit(1)
    )


def resolve_target(db: Session, line_id: int, day: date) -> tuple[int, float] | None:
    t = _latest_set(db, line_id, day)
    if t is not None:
        return t.target_output, float(t.target_eff)
    r = _latest_report_target(db, line_id, day)
    if r is not None:
        return r.target_output, float(r.target_eff)
    return None


def target_info(db: Session, line_id: int, day: date) -> dict:
    """Target in force on `day` plus where it came from, for the Target page."""
    t = _latest_set(db, line_id, day)
    if t is not None:
        return {
            "target_output": t.target_output,
            "target_eff": float(t.target_eff),
            "effective_from": t.effective_from,
            "set_by_name": t.set_by_user.full_name if t.set_by_user else None,
            "set_at": t.set_at,
        }
    r = _latest_report_target(db, line_id, day)
    return {
        "target_output": r.target_output if r else None,
        "target_eff": float(r.target_eff) if r else None,
        "effective_from": None,
        "set_by_name": None,
        "set_at": None,
    }


def set_target(
    db: Session, line: Line, effective_from: date, target_output: int, target_eff: float, user: User
) -> int:
    """Save a target from effective_from onward and rewrite the copies on the
    reports it now covers. Returns how many reports were updated. Caller commits."""
    row = db.scalar(
        select(LineTarget).where(LineTarget.line_id == line.id, LineTarget.effective_from == effective_from)
    )
    if row is None:
        row = LineTarget(line_id=line.id, effective_from=effective_from)
        db.add(row)
    row.target_output = target_output
    row.target_eff = target_eff
    row.set_by = user.id
    db.flush()

    next_change = db.scalar(
        select(LineTarget.effective_from)
        .where(LineTarget.line_id == line.id, LineTarget.effective_from > effective_from)
        .order_by(LineTarget.effective_from)
        .limit(1)
    )
    cond = [DailyReport.line_id == line.id, DailyReport.report_date >= effective_from]
    if next_change is not None:
        cond.append(DailyReport.report_date < next_change)
    result = db.execute(
        update(DailyReport).where(*cond).values(target_output=target_output, target_eff=target_eff)
    )
    return result.rowcount or 0


def entry_defaults(db: Session, line_id: int, day: date) -> dict | None:
    """Buyer / shift count / SAM from the line's latest submitted report
    before `day`, so a Tổ trưởng only retypes them when they actually change."""
    r = db.scalar(
        select(DailyReport)
        .where(DailyReport.line_id == line_id, DailyReport.report_date < day, DailyReport.is_submitted == True)  # noqa: E712
        .order_by(DailyReport.report_date.desc())
        .limit(1)
    )
    if r is None:
        return None
    return {"buyer": r.buyer, "shift_count": r.shift_count, "sam": float(r.sam) if r.sam is not None else None}
