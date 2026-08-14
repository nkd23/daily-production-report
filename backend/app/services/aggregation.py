"""Builds the per-line / per-executive / per-PU day summary that both the
dashboard API and the Excel export are based on, so the two stay consistent.

There is exactly one daily_reports row per line per date. The Tổ trưởng
enters shift_count (the factory's "tổng số Ca") directly on that row rather
than submitting once per shift, so no summing/averaging across rows is
needed here - every OUT-*/EFF-*/WIP value is read straight off the row.
SAM/target_output/target_eff come ONLY from report_date's own row - falling
back to the Line's static default (never auto-updated, only ever changed via
"Cấu hình Line"), never to another date's edit. A day nobody has touched
must show as having no data of its own, even if a later or earlier day does
- see routers/reports.py's resolve_line_target for the separate,
deliberately-forward-looking resolver used only to prefill the edit form
with a convenient starting point.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import resolve_effective_lock
from app.models import DailyReport, Line
from app.schemas import DashboardResponse, ExecutiveSummary, GroupSummary, IssueItem, KpiSummary, LineDaySummary


def _avg(values: list[float]) -> float | None:
    values = [v for v in values if v is not None]
    if not values:
        return None
    return round(sum(values) / len(values), 2)


def latest_target_snapshots(
    db: Session, report_date: date, line_id: int | None = None
) -> dict[int, DailyReport]:
    """Latest report row, as of report_date, that had its SAM/target explicitly
    set - keyed by line_id. This is the source of truth for a line's SAM/
    target_output/target_eff on a given day (they can change any day the
    buyer/style on a line changes), NOT the Line's own field, which only holds
    whatever was most recently edited overall and would incorrectly "leak"
    into how earlier, unreported days are displayed.

    Pass line_id to scope the query to a single line (used by routers/reports.py
    for one-line views); omitted, it resolves every line in one query (used by
    build_line_summaries below).
    """
    stmt = select(DailyReport).where(
        DailyReport.report_date <= report_date, DailyReport.target_output.is_not(None)
    )
    if line_id is not None:
        stmt = stmt.where(DailyReport.line_id == line_id)
    stmt = stmt.order_by(DailyReport.line_id, DailyReport.report_date.desc())
    rows = db.scalars(stmt).all()
    latest: dict[int, DailyReport] = {}
    for r in rows:
        latest.setdefault(r.line_id, r)
    return latest


def resolve_line_target(db: Session, line: Line, report_date: date) -> tuple[float, int, float]:
    """SAM/target_output/target_eff as they stood on report_date - see
    latest_target_snapshots. Used by routers/reports.py to show a Tổ trưởng
    the right day's numbers instead of the Line's ever-changing "current" value."""
    snapshot = latest_target_snapshots(db, report_date, line_id=line.id).get(line.id)
    if snapshot is not None:
        return float(snapshot.sam), snapshot.target_output, float(snapshot.target_eff)
    return float(line.sam), line.target_output, float(line.target_eff)


def _shift_weighted_avg(pairs: list[tuple[float | None, float | None]]) -> float | None:
    """Weighted average of a percentage, weighted by how many shifts each line
    ran - the factory's original formula: SUMPRODUCT(Shift, EFF%) / SUM(Shift).

    Lines with no value are dropped from the divisor as well as the numerator,
    which is what the original sheet does by hand (its EFF-FIN subtotals divide
    by 11/21/53 rather than the full 13/23/55, excluding the shifts of the one
    line that reported no EFF-FIN that day).
    """
    total_weight = 0.0
    total_weighted = 0.0
    for weight, eff in pairs:
        if not weight or eff is None:
            continue
        total_weight += weight
        total_weighted += weight * eff
    if not total_weight:
        return None
    return round(total_weighted / total_weight, 2)


def build_line_summaries(db: Session, report_date: date) -> list[LineDaySummary]:
    lines = db.scalars(
        select(Line).where(Line.is_active == True).order_by(Line.pu_group, Line.executive_name, Line.line_number)  # noqa: E712
    ).all()
    reports = db.scalars(select(DailyReport).where(DailyReport.report_date == report_date)).all()
    reports_by_line: dict[int, DailyReport] = {r.line_id: r for r in reports}

    summaries: list[LineDaySummary] = []
    for line in lines:
        report = reports_by_line.get(line.id)

        eff_sew = float(report.eff_sew) if report and report.eff_sew is not None else None
        eff_fin = float(report.eff_fin) if report and report.eff_fin is not None else None
        # shift_count (the factory's "tổng số Ca") is the weight for EFF%
        # averaging across lines: SUMPRODUCT(Shift, EFF%) / SUM(Shift). A line
        # that reported no EFF value for the day is dropped from the divisor
        # too (the original sheet's EFF-FIN subtotals divide by 11/21/53
        # rather than the full 13/23/55).
        shift_weight = report.shift_count if report else 0
        shift_display = str(report.shift_count) if report else "-"
        eff_sew_weight = shift_weight if eff_sew is not None else 0
        eff_fin_weight = shift_weight if eff_fin is not None else 0

        # Only report_date's own row counts - no history lookback here (see
        # module docstring). A line nobody touched today falls back to the
        # Line's static admin-configured default, not to a past day's edit.
        sam = float(report.sam) if report and report.sam is not None else float(line.sam)
        target_output = report.target_output if report and report.target_output is not None else line.target_output
        target_eff = float(report.target_eff) if report and report.target_eff is not None else float(line.target_eff)

        out_fin = report.out_fin_fin if report else None
        is_locked = (
            resolve_effective_lock(report.report_date, report.is_locked, report.secretary_override)
            if report
            else resolve_effective_lock(report_date, False, False)
        )

        # target_output == 0 means the line has never had a real target
        # configured - skip the comparison rather than showing a bogus VAR.
        var = (out_fin - target_output) if out_fin is not None and target_output else None

        summaries.append(
            LineDaySummary(
                line_id=line.id,
                line_number=line.line_number,
                executive_name=line.executive_name,
                pu_group=line.pu_group,
                buyer=report.buyer if report else None,
                sam=sam,
                target_output=target_output,
                target_eff=target_eff,
                shift_display=shift_display,
                shift_weight=shift_weight,
                eff_sew_weight=eff_sew_weight,
                eff_fin_weight=eff_fin_weight,
                out_sew=report.out_sew if report else None,
                eff_sew=eff_sew,
                out_fin_scanpack=report.out_fin_scanpack if report else None,
                out_fin_fin=out_fin,
                eff_fin=eff_fin,
                var=var,
                wip_dip=report.wip_dip if report else None,
                wip_pre_pi=report.wip_pre_pi if report else None,
                issue_note=report.issue_note if report else None,
                is_submitted=report.is_submitted if report else False,
                is_locked=is_locked,
            )
        )
    return summaries


def build_executive_summaries(lines: list[LineDaySummary]) -> list[ExecutiveSummary]:
    grouped: dict[tuple[str, str], list[LineDaySummary]] = {}
    for line in lines:
        key = (line.executive_name, line.pu_group.value)
        grouped.setdefault(key, []).append(line)

    result = []
    for (executive_name, pu_group), items in grouped.items():
        result.append(
            ExecutiveSummary(
                executive_name=executive_name,
                pu_group=pu_group,
                target_output=sum(i.target_output for i in items),
                out_fin_fin=sum((i.out_fin_fin or 0) for i in items),
                eff_fin_avg=_shift_weighted_avg([(i.eff_fin_weight, i.eff_fin) for i in items]),
                eff_sew_avg=_shift_weighted_avg([(i.eff_sew_weight, i.eff_sew) for i in items]),
                var=sum((i.var or 0) for i in items),
            )
        )
    return result


def _build_group_summary(
    label: str, level: str, items: list[LineDaySummary], sam_avg: float | None
) -> GroupSummary:
    """Every column here is recomputed from the raw lines, exactly as the
    original sheet's subtotal rows do - except SAM, which the sheet averages
    from the level below instead (see build_summary_table), so it is passed in.
    """
    return GroupSummary(
        label=label,
        level=level,
        target_output=sum(i.target_output for i in items),
        target_eff_avg=_shift_weighted_avg([(i.shift_weight, i.target_eff) for i in items if i.target_eff]),
        sam_avg=sam_avg,
        line_count=len(items),
        shift_total=sum(i.shift_weight for i in items),
        out_sew=sum((i.out_sew or 0) for i in items),
        eff_sew_avg=_shift_weighted_avg([(i.eff_sew_weight, i.eff_sew) for i in items]),
        out_fin_scanpack=sum((i.out_fin_scanpack or 0) for i in items),
        out_fin_fin=sum((i.out_fin_fin or 0) for i in items),
        eff_fin_avg=_shift_weighted_avg([(i.eff_fin_weight, i.eff_fin) for i in items]),
        var=sum((i.var or 0) for i in items),
        wip_dip=sum((i.wip_dip or 0) for i in items),
        wip_pre_pi=sum((i.wip_pre_pi or 0) for i in items),
    )


def build_summary_table(lines: list[LineDaySummary]) -> list[GroupSummary]:
    """Executive -> PU subtotal -> TTL rows, in the same reading order as the
    Excel export, built only from lines that have actually submitted data.

    SAM cascades rather than being recomputed: the original sheet averages the
    lines for an Executive row, then averages the *Executive rows* for a PU row,
    then the *PU rows* for TTL. That is not the same as a flat average over all
    lines (it weighs a 6-line group the same as a 10-line one), but it is what
    the factory's report shows, so it is reproduced deliberately.
    """
    submitted = [l for l in lines if l.is_submitted]

    lines_by_pu: dict[str, list[LineDaySummary]] = {}
    for l in submitted:
        lines_by_pu.setdefault(l.pu_group.value, []).append(l)

    result: list[GroupSummary] = []
    pu_rows: list[GroupSummary] = []
    for pu in sorted(lines_by_pu.keys()):
        pu_lines = lines_by_pu[pu]
        lines_by_exec: dict[str, list[LineDaySummary]] = {}
        for l in pu_lines:
            lines_by_exec.setdefault(l.executive_name, []).append(l)

        exec_rows: list[GroupSummary] = []
        for executive_name, exec_lines in lines_by_exec.items():
            row = _build_group_summary(
                executive_name, "executive", exec_lines, sam_avg=_avg([l.sam for l in exec_lines])
            )
            exec_rows.append(row)
            result.append(row)

        pu_row = _build_group_summary(
            f"{pu} - TTL", "pu", pu_lines, sam_avg=_avg([r.sam_avg for r in exec_rows])
        )
        pu_rows.append(pu_row)
        result.append(pu_row)

    if submitted:
        result.append(
            _build_group_summary("TTL", "ttl", submitted, sam_avg=_avg([r.sam_avg for r in pu_rows]))
        )
    return result


def build_kpi_summary(lines: list[LineDaySummary]) -> KpiSummary:
    total_target = sum(l.target_output for l in lines)
    total_actual = sum((l.out_fin_fin or 0) for l in lines)
    return KpiSummary(
        total_target_output=total_target,
        total_actual_output=total_actual,
        completion_rate=round(total_actual / total_target * 100, 1) if total_target else None,
        avg_eff_sew=_shift_weighted_avg([(l.eff_sew_weight, l.eff_sew) for l in lines]),
        avg_eff_fin=_shift_weighted_avg([(l.eff_fin_weight, l.eff_fin) for l in lines]),
        total_wip_dip=sum((l.wip_dip or 0) for l in lines),
        total_wip_pre_pi=sum((l.wip_pre_pi or 0) for l in lines),
        lines_with_issue=sum(1 for l in lines if l.issue_note),
        lines_submitted=sum(1 for l in lines if l.is_submitted),
        lines_total=len(lines),
    )


def build_issue_list(lines: list[LineDaySummary]) -> list[IssueItem]:
    return [
        IssueItem(line_number=l.line_number, buyer=l.buyer, executive_name=l.executive_name, issue_note=l.issue_note)
        for l in lines
        if l.issue_note
    ]


def build_dashboard(db: Session, report_date: date) -> DashboardResponse:
    lines = build_line_summaries(db, report_date)
    return DashboardResponse(
        report_date=report_date,
        kpi=build_kpi_summary(lines),
        lines=lines,
        executives=build_executive_summaries(lines),
        summary_table=build_summary_table(lines),
        issues=build_issue_list(lines),
    )
