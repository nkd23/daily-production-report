"""Monday -> Sunday rollup of the daily figures in app.services.aggregation.

Every number is built from the same per-line-per-day rows the daily
dashboard uses, so a week is exactly the sum of its days:
- outputs, targets and VAR are summed over the week;
- EFF% extends the factory's daily formula across days,
  SUMPRODUCT(shift, EFF%) / SUM(shift) over every line-day, so a 2-shift day
  weighs twice a 1-shift day;
- WIP (tồn) is a point-in-time stock count, so a line's weekly value is the
  one from its last submitted day in the week, never a sum.

As on the daily summary table, the per-line and Executive/PU/TTL rows only
count submitted line-days; the KPI cards add up the daily KPI cards.
"""

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DailyReport
from app.schemas import (
    GroupSummary,
    LineDaySummary,
    WeeklyDayPoint,
    WeeklyKpi,
    WeeklyLineSummary,
    WeeklyResponse,
    WeeklyWipReasonTotals,
)
from app.services.aggregation import _avg, _shift_weighted_avg, active_lines, build_kpi_summary, summarize_lines


def week_bounds(any_day: date) -> tuple[date, date]:
    start = any_day - timedelta(days=any_day.weekday())
    return start, start + timedelta(days=6)


def _completion(actual: int, target: int) -> float | None:
    return round(actual / target * 100, 1) if target else None


def _weekly_line(line_days: list[LineDaySummary]) -> WeeklyLineSummary:
    first = line_days[0]
    submitted = [d for d in line_days if d.is_submitted]
    target_output = sum(d.target_output for d in submitted)
    out_fin_fin = sum((d.out_fin_fin or 0) for d in submitted)
    last = submitted[-1] if submitted else None
    return WeeklyLineSummary(
        line_id=first.line_id,
        line_number=first.line_number,
        executive_name=first.executive_name,
        pu_group=first.pu_group,
        days_submitted=len(submitted),
        shift_total=sum(d.shift_weight for d in submitted),
        target_output=target_output,
        target_eff=_shift_weighted_avg([(d.shift_weight, d.target_eff) for d in submitted if d.target_eff]),
        out_sew=sum((d.out_sew or 0) for d in submitted),
        eff_sew=_shift_weighted_avg([(d.eff_sew_weight, d.eff_sew) for d in submitted]),
        out_fin_scanpack=sum((d.out_fin_scanpack or 0) for d in submitted),
        out_fin_fin=out_fin_fin,
        eff_fin=_shift_weighted_avg([(d.eff_fin_weight, d.eff_fin) for d in submitted]),
        completion_rate=_completion(out_fin_fin, target_output),
        var=sum((d.var or 0) for d in submitted),
        wip_dip=last.wip_dip if last else None,
        wip_pre_pi=last.wip_pre_pi if last else None,
        wip_machine_days=sum(1 for d in submitted if d.wip_reason_machine),
        wip_line_spread_days=sum(1 for d in submitted if d.wip_reason_line_spread),
        wip_semi_finished_days=sum(1 for d in submitted if d.wip_reason_semi_finished),
        wip_quality_days=sum(1 for d in submitted if d.wip_reason_quality),
        issue_days=sum(1 for d in submitted if d.issue_note),
    )


def _weekly_group(
    label: str,
    level: str,
    line_days: list[LineDaySummary],
    week_lines: list[WeeklyLineSummary],
    sam_avg: float | None,
) -> GroupSummary:
    items = [d for d in line_days if d.is_submitted]
    return GroupSummary(
        label=label,
        level=level,
        target_output=sum(d.target_output for d in items),
        target_eff_avg=_shift_weighted_avg([(d.shift_weight, d.target_eff) for d in items if d.target_eff]),
        sam_avg=sam_avg,
        line_count=len(week_lines),
        shift_total=sum(d.shift_weight for d in items),
        out_sew=sum((d.out_sew or 0) for d in items),
        eff_sew_avg=_shift_weighted_avg([(d.eff_sew_weight, d.eff_sew) for d in items]),
        out_fin_scanpack=sum((d.out_fin_scanpack or 0) for d in items),
        out_fin_fin=sum((d.out_fin_fin or 0) for d in items),
        eff_fin_avg=_shift_weighted_avg([(d.eff_fin_weight, d.eff_fin) for d in items]),
        var=sum((d.var or 0) for d in items),
        wip_dip=sum((w.wip_dip or 0) for w in week_lines),
        wip_pre_pi=sum((w.wip_pre_pi or 0) for w in week_lines),
    )


def _weekly_summary_table(
    days_by_line: dict[int, list[LineDaySummary]], week_lines: list[WeeklyLineSummary]
) -> list[GroupSummary]:
    """Same Executive -> PU -> TTL layout and SAM cascade as the daily
    build_summary_table, with each line's SAM first averaged over its days."""
    active = [w for w in week_lines if w.days_submitted > 0]
    line_sam = {
        w.line_id: _avg([d.sam for d in days_by_line[w.line_id] if d.is_submitted]) for w in active
    }

    def days_of(lines: list[WeeklyLineSummary]) -> list[LineDaySummary]:
        return [d for w in lines for d in days_by_line[w.line_id]]

    by_pu: dict[str, list[WeeklyLineSummary]] = {}
    for w in active:
        by_pu.setdefault(w.pu_group.value, []).append(w)

    result: list[GroupSummary] = []
    pu_rows: list[GroupSummary] = []
    for pu in sorted(by_pu):
        by_exec: dict[str, list[WeeklyLineSummary]] = {}
        for w in by_pu[pu]:
            by_exec.setdefault(w.executive_name, []).append(w)

        exec_rows: list[GroupSummary] = []
        for executive_name, exec_lines in by_exec.items():
            row = _weekly_group(
                executive_name,
                "executive",
                days_of(exec_lines),
                exec_lines,
                sam_avg=_avg([line_sam[w.line_id] for w in exec_lines]),
            )
            exec_rows.append(row)
            result.append(row)

        pu_row = _weekly_group(
            f"{pu} - TTL", "pu", days_of(by_pu[pu]), by_pu[pu], sam_avg=_avg([r.sam_avg for r in exec_rows])
        )
        pu_rows.append(pu_row)
        result.append(pu_row)

    if active:
        result.append(
            _weekly_group("TTL", "ttl", days_of(active), active, sam_avg=_avg([r.sam_avg for r in pu_rows]))
        )
    return result


def build_weekly(db: Session, any_day: date, executive_scope: str | None = None) -> WeeklyResponse:
    week_start, week_end = week_bounds(any_day)
    days = [week_start + timedelta(days=i) for i in range(7)]

    # Two queries for the whole week (lines + that week's reports) rather
    # than two per day.
    lines = active_lines(db)
    reports_by_day: dict[date, dict[int, DailyReport]] = {day: {} for day in days}
    for r in db.scalars(
        select(DailyReport).where(DailyReport.report_date >= week_start, DailyReport.report_date <= week_end)
    ):
        reports_by_day[r.report_date][r.line_id] = r

    lines_per_day: list[list[LineDaySummary]] = []
    for day in days:
        day_lines = summarize_lines(lines, reports_by_day[day], day)
        if executive_scope is not None:
            day_lines = [l for l in day_lines if l.executive_name == executive_scope]
        lines_per_day.append(day_lines)

    # Line order follows the daily summaries (PU, Executive, Line number).
    days_by_line: dict[int, list[LineDaySummary]] = {}
    for day_lines in lines_per_day:
        for l in day_lines:
            days_by_line.setdefault(l.line_id, []).append(l)
    week_lines = [_weekly_line(line_days) for line_days in days_by_line.values()]

    daily_kpis = [build_kpi_summary(day_lines) for day_lines in lines_per_day]
    day_points = [
        WeeklyDayPoint(
            report_date=day,
            target_output=k.total_target_output,
            actual_output=k.total_actual_output,
            completion_rate=k.completion_rate,
            avg_eff_sew=k.avg_eff_sew,
            avg_eff_fin=k.avg_eff_fin,
            wip_dip=k.total_wip_dip,
            wip_pre_pi=k.total_wip_pre_pi,
            lines_submitted=k.lines_submitted,
        )
        for day, k in zip(days, daily_kpis)
    ]

    all_line_days = [l for day_lines in lines_per_day for l in day_lines]
    total_target = sum(k.total_target_output for k in daily_kpis)
    total_actual = sum(k.total_actual_output for k in daily_kpis)
    kpi = WeeklyKpi(
        total_target_output=total_target,
        total_actual_output=total_actual,
        completion_rate=_completion(total_actual, total_target),
        avg_eff_sew=_shift_weighted_avg([(l.eff_sew_weight, l.eff_sew) for l in all_line_days]),
        avg_eff_fin=_shift_weighted_avg([(l.eff_fin_weight, l.eff_fin) for l in all_line_days]),
        end_wip_dip=sum((w.wip_dip or 0) for w in week_lines),
        end_wip_pre_pi=sum((w.wip_pre_pi or 0) for w in week_lines),
        days_with_data=sum(1 for k in daily_kpis if k.lines_submitted > 0),
        line_days_submitted=sum(k.lines_submitted for k in daily_kpis),
        issue_line_days=sum(w.issue_days for w in week_lines),
    )

    summary_table = _weekly_summary_table(days_by_line, week_lines)
    if executive_scope is not None:
        summary_table = [r for r in summary_table if r.level == "executive"]

    return WeeklyResponse(
        week_start=week_start,
        week_end=week_end,
        iso_week=week_start.isocalendar().week,
        kpi=kpi,
        days=day_points,
        lines=week_lines,
        summary_table=summary_table,
        wip_reasons=WeeklyWipReasonTotals(
            machine=sum(w.wip_machine_days for w in week_lines),
            line_spread=sum(w.wip_line_spread_days for w in week_lines),
            semi_finished=sum(w.wip_semi_finished_days for w in week_lines),
            quality=sum(w.wip_quality_days for w in week_lines),
        ),
    )
