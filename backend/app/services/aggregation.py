"""Builds the per-line / per-executive / per-PU day summary that both the
dashboard API and the Excel export are based on, so the two stay consistent.

A line can have up to 2 daily_reports rows for a given date (shift 1 and 2).
They are combined here: quantities (OUT-*, WIP) are summed, efficiencies
(EFF-*) are averaged across the shifts that reported a value, and issue notes
are concatenated.
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


def build_line_summaries(db: Session, report_date: date) -> list[LineDaySummary]:
    lines = db.scalars(
        select(Line).where(Line.is_active == True).order_by(Line.pu_group, Line.executive_name, Line.line_number)  # noqa: E712
    ).all()
    reports = db.scalars(select(DailyReport).where(DailyReport.report_date == report_date)).all()

    reports_by_line: dict[int, list[DailyReport]] = {}
    for r in reports:
        reports_by_line.setdefault(r.line_id, []).append(r)

    summaries: list[LineDaySummary] = []
    for line in lines:
        line_reports = sorted(reports_by_line.get(line.id, []), key=lambda r: r.shift)

        out_sew = sum((r.out_sew or 0) for r in line_reports) if line_reports else None
        out_scanpack = sum((r.out_fin_scanpack or 0) for r in line_reports) if line_reports else None
        out_fin = sum((r.out_fin_fin or 0) for r in line_reports) if line_reports else None
        wip_values = [r.wip_fin for r in line_reports if r.wip_fin is not None]
        wip_fin = wip_values[-1] if wip_values else None
        eff_sew = _avg([float(r.eff_sew) for r in line_reports if r.eff_sew is not None])
        eff_fin = _avg([float(r.eff_fin) for r in line_reports if r.eff_fin is not None])
        issue_notes = [r.issue_note for r in line_reports if r.issue_note]
        issue_note = " | ".join(issue_notes) if issue_notes else None
        shift_display = "+".join(str(r.shift) for r in line_reports) if line_reports else "-"

        buyers = list(dict.fromkeys(r.buyer for r in line_reports if r.buyer))
        buyer = " / ".join(buyers) if buyers else None

        is_submitted = any(r.is_submitted for r in line_reports)
        if line_reports:
            is_locked = all(
                resolve_effective_lock(r.report_date, r.is_locked, r.secretary_override) for r in line_reports
            )
        else:
            is_locked = resolve_effective_lock(report_date, False, False)

        var = (out_fin - line.target_output) if out_fin is not None else None

        summaries.append(
            LineDaySummary(
                line_id=line.id,
                line_number=line.line_number,
                executive_name=line.executive_name,
                pu_group=line.pu_group,
                buyer=buyer,
                sam=float(line.sam),
                target_output=line.target_output,
                target_eff=float(line.target_eff),
                shift_display=shift_display,
                out_sew=out_sew,
                eff_sew=eff_sew,
                out_fin_scanpack=out_scanpack,
                out_fin_fin=out_fin,
                eff_fin=eff_fin,
                var=var,
                wip_fin=wip_fin,
                issue_note=issue_note,
                is_submitted=is_submitted,
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
                eff_fin_avg=_avg([i.eff_fin for i in items if i.eff_fin is not None]),
                eff_sew_avg=_avg([i.eff_sew for i in items if i.eff_sew is not None]),
                var=sum((i.var or 0) for i in items),
            )
        )
    return result


def _build_group_summary(label: str, level: str, items: list[LineDaySummary]) -> GroupSummary:
    return GroupSummary(
        label=label,
        level=level,
        target_output=sum(i.target_output for i in items),
        target_eff_avg=_avg([i.target_eff for i in items]),
        sam_avg=_avg([i.sam for i in items]),
        line_count=len(items),
        out_sew=sum((i.out_sew or 0) for i in items),
        eff_sew_avg=_avg([i.eff_sew for i in items if i.eff_sew is not None]),
        out_fin_scanpack=sum((i.out_fin_scanpack or 0) for i in items),
        out_fin_fin=sum((i.out_fin_fin or 0) for i in items),
        eff_fin_avg=_avg([i.eff_fin for i in items if i.eff_fin is not None]),
        var=sum((i.var or 0) for i in items),
        wip_fin=sum((i.wip_fin or 0) for i in items),
    )


def build_summary_table(lines: list[LineDaySummary]) -> list[GroupSummary]:
    """Executive -> PU subtotal -> TTL rows, in the same reading order as the
    Excel export, built only from lines that have actually submitted data."""
    submitted = [l for l in lines if l.is_submitted]

    lines_by_pu: dict[str, list[LineDaySummary]] = {}
    for l in submitted:
        lines_by_pu.setdefault(l.pu_group.value, []).append(l)

    result: list[GroupSummary] = []
    for pu in sorted(lines_by_pu.keys()):
        pu_lines = lines_by_pu[pu]
        lines_by_exec: dict[str, list[LineDaySummary]] = {}
        for l in pu_lines:
            lines_by_exec.setdefault(l.executive_name, []).append(l)
        for executive_name, exec_lines in lines_by_exec.items():
            result.append(_build_group_summary(executive_name, "executive", exec_lines))
        result.append(_build_group_summary(f"{pu} - TTL", "pu", pu_lines))

    if submitted:
        result.append(_build_group_summary("TTL", "ttl", submitted))
    return result


def build_kpi_summary(lines: list[LineDaySummary]) -> KpiSummary:
    total_target = sum(l.target_output for l in lines)
    total_actual = sum((l.out_fin_fin or 0) for l in lines)
    return KpiSummary(
        total_target_output=total_target,
        total_actual_output=total_actual,
        completion_rate=round(total_actual / total_target * 100, 1) if total_target else None,
        avg_eff_sew=_avg([l.eff_sew for l in lines if l.eff_sew is not None]),
        avg_eff_fin=_avg([l.eff_fin for l in lines if l.eff_fin is not None]),
        total_wip=sum((l.wip_fin or 0) for l in lines),
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
