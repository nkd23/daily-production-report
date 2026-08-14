import json
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, local_now, local_today, require_thu_ky_or_sep, resolve_effective_lock
from app.models import DailyReport, Line, ReportHistory, User, UserRole
from app.schemas import (
    DailyReportInput,
    DailyReportOut,
    LineOut,
    LineTargetUpdate,
    LineWithReportOut,
    ReportHistoryOut,
    UnlockRequest,
)
from app.services.aggregation import latest_target_snapshots, resolve_line_target

router = APIRouter(prefix="/api/reports", tags=["reports"])

HISTORY_FIELDS = (
    "shift_count", "buyer", "sam", "target_output", "target_eff", "out_sew", "eff_sew",
    "out_fin_scanpack", "out_fin_fin", "eff_fin", "wip_dip", "wip_pre_pi", "issue_note",
)


def _snapshot(report: DailyReport) -> dict:
    """Plain-JSON-able snapshot of every field ReportHistory tracks."""
    out = {}
    for field in HISTORY_FIELDS:
        value = getattr(report, field)
        out[field] = float(value) if isinstance(value, Decimal) else value
    return out


def _record_history(
    db: Session,
    *,
    line_id: int,
    report_date: date,
    action: str,
    changed_by: int,
    old: dict | None,
    new: dict | None,
):
    if old == new:
        return  # nothing actually changed - don't clutter the trail
    db.add(
        ReportHistory(
            line_id=line_id,
            report_date=report_date,
            action=action,
            changed_by=changed_by,
            old_values=json.dumps(old) if old is not None else None,
            new_values=json.dumps(new) if new is not None else None,
        )
    )


def _report_out(report: DailyReport, line: Line) -> DailyReportOut:
    """VAR compares against the target entered on this exact report row, not
    an earlier day's edit or the Line's ever-changing "current" value -
    falls back to the Line's static default only when this day never had a
    target of its own (see app.services.aggregation module docstring)."""
    out = DailyReportOut.model_validate(report)
    out.is_locked = resolve_effective_lock(report.report_date, report.is_locked, report.secretary_override)
    target_output = report.target_output if report.target_output is not None else line.target_output
    out.var = (report.out_fin_fin - target_output) if report.out_fin_fin is not None and target_output else None
    return out


def _line_out(line: Line, sam: float, target_output: int, target_eff: float) -> LineOut:
    """LineOut with sam/target_output/target_eff overridden to whatever was
    resolved as true on the report_date in question - SAM/target can change
    day to day, so the Line's own field is only a fallback default."""
    out = LineOut.model_validate(line)
    out.to_truong_name = line.to_truong.full_name if line.to_truong else None
    out.sam, out.target_output, out.target_eff = sam, target_output, target_eff
    return out


def _get_line_or_404(db: Session, line_id: int) -> Line:
    line = db.get(Line, line_id)
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy line")
    return line


def _assert_line_access(current_user: User, line: Line):
    if current_user.role == UserRole.to_truong and line.to_truong_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không phụ trách line này")


@router.get("/my-lines", response_model=list[LineWithReportOut])
def get_my_lines(
    report_date: date = Query(default_factory=local_today),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Line).where(Line.is_active == True)  # noqa: E712
    if current_user.role == UserRole.to_truong:
        stmt = stmt.where(Line.to_truong_user_id == current_user.id)
    lines = db.scalars(stmt.order_by(Line.pu_group, Line.executive_name, Line.line_number)).all()

    line_ids = [l.id for l in lines]
    reports = {}
    if line_ids:
        report_rows = db.scalars(
            select(DailyReport).where(
                DailyReport.line_id.in_(line_ids),
                DailyReport.report_date == report_date,
            )
        ).all()
        reports = {r.line_id: r for r in report_rows}

    target_snapshots = latest_target_snapshots(db, report_date)

    result = []
    for line in lines:
        snapshot = target_snapshots.get(line.id)
        if snapshot is not None:
            sam, target_output, target_eff = float(snapshot.sam), snapshot.target_output, float(snapshot.target_eff)
        else:
            sam, target_output, target_eff = float(line.sam), line.target_output, float(line.target_eff)

        report = reports.get(line.id)
        if report is not None:
            report_out = _report_out(report, line)
            is_editable = current_user.role != UserRole.to_truong or not report_out.is_locked
        else:
            report_out = None
            is_editable = current_user.role != UserRole.to_truong or not resolve_effective_lock(report_date, False, False)
        result.append(
            LineWithReportOut(
                line=_line_out(line, sam, target_output, target_eff), report=report_out, is_editable=is_editable
            )
        )
    return result


@router.get("/lines/{line_id}", response_model=LineWithReportOut, dependencies=[Depends(require_thu_ky_or_sep)])
def get_line_report(
    line_id: int,
    report_date: date = Query(default_factory=local_today),
    db: Session = Depends(get_db),
):
    """Fetch a single line/date report for Thư ký/Sếp to inspect or submit on
    behalf of a Tổ trưởng ("nhập hộ")."""
    line = _get_line_or_404(db, line_id)
    report = db.scalar(
        select(DailyReport).where(DailyReport.line_id == line_id, DailyReport.report_date == report_date)
    )
    sam, target_output, target_eff = resolve_line_target(db, line, report_date)
    report_out = _report_out(report, line) if report else None
    return LineWithReportOut(line=_line_out(line, sam, target_output, target_eff), report=report_out, is_editable=True)


@router.post("/lines/{line_id}", response_model=DailyReportOut)
def submit_report(
    line_id: int,
    payload: DailyReportInput,
    report_date: date = Query(default_factory=local_today),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    line = _get_line_or_404(db, line_id)
    _assert_line_access(current_user, line)

    report = db.scalar(
        select(DailyReport).where(DailyReport.line_id == line_id, DailyReport.report_date == report_date)
    )

    if report is not None:
        effective_locked = resolve_effective_lock(report.report_date, report.is_locked, report.secretary_override)
        if current_user.role == UserRole.to_truong and effective_locked:
            raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Dữ liệu ngày này đã bị khoá, liên hệ Thư ký để mở khoá")
    else:
        if current_user.role == UserRole.to_truong and resolve_effective_lock(report_date, False, False):
            raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Dữ liệu ngày này đã bị khoá, liên hệ Thư ký để mở khoá")
        report = DailyReport(line_id=line_id, report_date=report_date)
        db.add(report)

    old_snapshot = _snapshot(report)

    for field in ("shift_count", "buyer", "out_sew", "eff_sew", "out_fin_scanpack", "out_fin_fin", "eff_fin", "wip_dip", "wip_pre_pi", "issue_note"):
        setattr(report, field, getattr(payload, field))

    report.is_submitted = True
    report.submitted_by = current_user.id
    report.submitted_at = local_now().replace(tzinfo=None)

    _record_history(
        db, line_id=line_id, report_date=report_date, action="submit",
        changed_by=current_user.id, old=old_snapshot, new=_snapshot(report),
    )

    db.commit()
    db.refresh(report)
    return _report_out(report, line)


@router.patch("/lines/{line_id}/targets", response_model=LineOut)
def update_line_targets(
    line_id: int,
    payload: LineTargetUpdate,
    report_date: date = Query(default_factory=local_today),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Let a line's own Tổ trưởng (in addition to Thư ký/Sếp) set SAM / NEW
    OUT-TAR / NEW EFF-TAR for a specific day - these can change day to
    day (the factory re-sets them whenever the buyer/style on a line changes),
    so they are stored on that day's report row, not as a fixed Line property.
    Line.sam/target_output/target_eff is deliberately left untouched here: it
    is only ever a bootstrap default for a line that has no history at all, and
    mutating it on every edit would make it "leak" into how earlier dates with
    no report of their own are displayed (they resolve via report history, see
    app.services.aggregation.resolve_line_target - not via the Line's field).
    """
    line = _get_line_or_404(db, line_id)
    _assert_line_access(current_user, line)

    report = db.scalar(
        select(DailyReport).where(DailyReport.line_id == line_id, DailyReport.report_date == report_date)
    )
    if report is not None:
        effective_locked = resolve_effective_lock(report.report_date, report.is_locked, report.secretary_override)
        if current_user.role == UserRole.to_truong and effective_locked:
            raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Dữ liệu ngày này đã bị khoá, liên hệ Thư ký để mở khoá")
    else:
        if current_user.role == UserRole.to_truong and resolve_effective_lock(report_date, False, False):
            raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Dữ liệu ngày này đã bị khoá, liên hệ Thư ký để mở khoá")
        report = DailyReport(line_id=line_id, report_date=report_date)
        db.add(report)

    old_snapshot = _snapshot(report)

    report.sam = payload.sam
    report.target_output = payload.target_output
    report.target_eff = payload.target_eff

    _record_history(
        db, line_id=line_id, report_date=report_date, action="target_update",
        changed_by=current_user.id, old=old_snapshot, new=_snapshot(report),
    )

    db.commit()
    return _line_out(line, payload.sam, payload.target_output, payload.target_eff)


@router.delete("/lines/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    line_id: int,
    report_date: date = Query(default_factory=local_today),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Let a Tổ trưởng wipe a wrongly-entered report and start over (or Thư
    ký/Sếp do it for them). Blocked once locked, same rule as submitting."""
    line = _get_line_or_404(db, line_id)
    _assert_line_access(current_user, line)

    report = db.scalar(
        select(DailyReport).where(DailyReport.line_id == line_id, DailyReport.report_date == report_date)
    )
    if report is None:
        return

    effective_locked = resolve_effective_lock(report.report_date, report.is_locked, report.secretary_override)
    if current_user.role == UserRole.to_truong and effective_locked:
        raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Dữ liệu ngày này đã bị khoá, liên hệ Thư ký để mở khoá")

    _record_history(
        db, line_id=line_id, report_date=report_date, action="delete",
        changed_by=current_user.id, old=_snapshot(report), new=None,
    )

    db.delete(report)
    db.commit()


@router.get(
    "/lines/{line_id}/history", response_model=list[ReportHistoryOut], dependencies=[Depends(require_thu_ky_or_sep)]
)
def get_report_history(
    line_id: int,
    report_date: date = Query(default_factory=local_today),
    db: Session = Depends(get_db),
):
    """Every submit/target-update/delete for this line on this date, newest
    first - Thư ký/Sếp-only audit trail."""
    rows = db.scalars(
        select(ReportHistory)
        .where(ReportHistory.line_id == line_id, ReportHistory.report_date == report_date)
        .order_by(ReportHistory.changed_at.desc())
    ).all()
    return [
        ReportHistoryOut(
            id=r.id,
            action=r.action,
            changed_by_name=r.changed_by_user.full_name if r.changed_by_user else None,
            changed_at=r.changed_at,
            old_values=json.loads(r.old_values) if r.old_values else None,
            new_values=json.loads(r.new_values) if r.new_values else None,
        )
        for r in rows
    ]


@router.patch("/{report_id}/lock", response_model=DailyReportOut, dependencies=[Depends(require_thu_ky_or_sep)])
def set_lock(report_id: int, payload: UnlockRequest, db: Session = Depends(get_db)):
    report = db.get(DailyReport, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy báo cáo")
    report.is_locked = payload.is_locked
    report.secretary_override = True
    db.commit()
    db.refresh(report)
    line = _get_line_or_404(db, report.line_id)
    return _report_out(report, line)


@router.patch("/lines/{line_id}/lock", response_model=DailyReportOut, dependencies=[Depends(require_thu_ky_or_sep)])
def set_lock_by_line(
    line_id: int,
    payload: UnlockRequest,
    report_date: date = Query(default_factory=local_today),
    db: Session = Depends(get_db),
):
    """Unlock (or lock) a line/date even if Tổ trưởng has not submitted
    anything yet, so a report row may not exist. Used by Thư ký to let a Tổ
    trưởng submit late after the automatic lock hour has passed."""
    line = _get_line_or_404(db, line_id)
    report = db.scalar(
        select(DailyReport).where(DailyReport.line_id == line_id, DailyReport.report_date == report_date)
    )
    if report is None:
        report = DailyReport(line_id=line_id, report_date=report_date)
        db.add(report)
    report.is_locked = payload.is_locked
    report.secretary_override = True
    db.commit()
    db.refresh(report)
    return _report_out(report, line)
