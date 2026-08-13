from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, local_now, local_today, require_thu_ky_or_sep, resolve_effective_lock
from app.models import DailyReport, Line, User, UserRole
from app.schemas import DailyReportInput, DailyReportOut, LineOut, LineWithReportOut, UnlockRequest

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _report_out(report: DailyReport, line: Line) -> DailyReportOut:
    out = DailyReportOut.model_validate(report)
    out.is_locked = resolve_effective_lock(report.report_date, report.is_locked, report.secretary_override)
    out.var = (report.out_fin_fin - line.target_output) if report.out_fin_fin is not None else None
    return out


def _line_out(line: Line) -> LineOut:
    out = LineOut.model_validate(line)
    out.to_truong_name = line.to_truong.full_name if line.to_truong else None
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
    shift: int = Query(default=1, ge=1, le=2),
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
                DailyReport.shift == shift,
            )
        ).all()
        reports = {r.line_id: r for r in report_rows}

    result = []
    for line in lines:
        report = reports.get(line.id)
        if report is not None:
            report_out = _report_out(report, line)
            is_editable = current_user.role != UserRole.to_truong or not report_out.is_locked
        else:
            report_out = None
            is_editable = current_user.role != UserRole.to_truong or not resolve_effective_lock(report_date, False, False)
        result.append(LineWithReportOut(line=_line_out(line), report=report_out, is_editable=is_editable))
    return result


@router.get("/lines/{line_id}", response_model=LineWithReportOut, dependencies=[Depends(require_thu_ky_or_sep)])
def get_line_report(
    line_id: int,
    report_date: date = Query(default_factory=local_today),
    shift: int = Query(default=1, ge=1, le=2),
    db: Session = Depends(get_db),
):
    """Fetch a single line/date/shift report for Thư ký/Sếp to inspect or
    submit on behalf of a Tổ trưởng ("nhập hộ")."""
    line = _get_line_or_404(db, line_id)
    report = db.scalar(
        select(DailyReport).where(
            DailyReport.line_id == line_id, DailyReport.report_date == report_date, DailyReport.shift == shift
        )
    )
    report_out = _report_out(report, line) if report else None
    return LineWithReportOut(line=_line_out(line), report=report_out, is_editable=True)


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
        select(DailyReport).where(
            DailyReport.line_id == line_id,
            DailyReport.report_date == report_date,
            DailyReport.shift == payload.shift,
        )
    )

    if report is not None:
        effective_locked = resolve_effective_lock(report.report_date, report.is_locked, report.secretary_override)
        if current_user.role == UserRole.to_truong and effective_locked:
            raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Dữ liệu ngày này đã bị khoá, liên hệ Thư ký để mở khoá")
    else:
        if current_user.role == UserRole.to_truong and resolve_effective_lock(report_date, False, False):
            raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Dữ liệu ngày này đã bị khoá, liên hệ Thư ký để mở khoá")
        report = DailyReport(line_id=line_id, report_date=report_date, shift=payload.shift)
        db.add(report)

    for field in ("buyer", "out_sew", "eff_sew", "out_fin_scanpack", "out_fin_fin", "eff_fin", "wip_fin", "issue_note"):
        setattr(report, field, getattr(payload, field))

    report.is_submitted = True
    report.submitted_by = current_user.id
    report.submitted_at = local_now().replace(tzinfo=None)

    db.commit()
    db.refresh(report)
    return _report_out(report, line)


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
    shift: int = Query(default=1, ge=1, le=2),
    db: Session = Depends(get_db),
):
    """Unlock (or lock) a line/date/shift even if Tổ trưởng has not submitted
    anything yet, so a report row may not exist. Used by Thư ký to let a Tổ
    trưởng submit late after the automatic lock hour has passed."""
    line = _get_line_or_404(db, line_id)
    report = db.scalar(
        select(DailyReport).where(
            DailyReport.line_id == line_id, DailyReport.report_date == report_date, DailyReport.shift == shift
        )
    )
    if report is None:
        report = DailyReport(line_id=line_id, report_date=report_date, shift=shift)
        db.add(report)
    report.is_locked = payload.is_locked
    report.secretary_override = True
    db.commit()
    db.refresh(report)
    return _report_out(report, line)
