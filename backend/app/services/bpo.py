"""BPO-date warnings on running orders (Tiến độ): is the order on track to
ship by its BPO date? Rules agreed with the factory:

- End sew must be done SEW_LEAD_DAYS working days before the BPO date
  (one more for WF & TAP orders, which need longer to pack - see the Close
  order rule), End pack PACK_LEAD_DAYS working day before it.
  Working days = Monday-Saturday minus holidays (close_order.working_days).
- "overdue": the BPO date has passed and the order is still not packed out.
- "late":    a deadline has passed with that step still not done.
- "soon":    WARN_DAYS working days or fewer to a deadline (today included)
             with that step still not done.

A running order is never packed out (Tiến độ drops packed rows), so the step
still to do is End sew while End sew is empty, otherwise End pack."""

from datetime import date, timedelta

from app.services.progress import parse_iso

SEW_LEAD_DAYS = 4
PACK_LEAD_DAYS = 1
WARN_DAYS = 3
WF_CATEGORY = "WWF_T"

LEVEL_ORDER = {"overdue": 0, "late": 1, "soon": 2}


def _is_working(day: date, holidays: set[date]) -> bool:
    return day.weekday() != 6 and day not in holidays


def minus_working_days(day: date, n: int, holidays: set[date]) -> date:
    """The working day n working days before `day`."""
    while n > 0:
        day -= timedelta(days=1)
        if _is_working(day, holidays):
            n -= 1
    return day


def working_days_until(today: date, deadline: date, holidays: set[date]) -> int:
    """Working days from today to the deadline, both counted (1 = the
    deadline is today)."""
    count = 0
    day = today
    while day <= deadline:
        if _is_working(day, holidays):
            count += 1
        day += timedelta(days=1)
    return count


def _dm(d: date) -> str:
    return f"{d.day:02d}/{d.month:02d}"


def bpo_status(
    bpo_date: str | None, end_sew: str | None, product_category: str | None, today: date, holidays: set[date]
) -> dict | None:
    """{level, stage, deadline, text} for a running order, or None when it
    is on track (or has no BPO date)."""
    bpo = parse_iso(bpo_date)
    if bpo is None:
        return None
    sewn = bool((end_sew or "").strip())
    step = "End pack" if sewn else "End sew"
    if today > bpo:
        days = (today - bpo).days
        return {"level": "overdue", "stage": "pack" if sewn else "sew", "deadline": bpo,
                "text": f"Quá BPO {days} ngày – chưa {step}"}
    wf = (product_category or "").strip().upper() == WF_CATEGORY
    lead = PACK_LEAD_DAYS if sewn else SEW_LEAD_DAYS + (1 if wf else 0)
    deadline = minus_working_days(bpo, lead, holidays)
    if today > deadline:
        days = (today - deadline).days
        return {"level": "late", "stage": "pack" if sewn else "sew", "deadline": deadline,
                "text": f"Trễ hạn {step} {_dm(deadline)} ({days} ngày)"}
    left = working_days_until(today, deadline, holidays)
    if left <= WARN_DAYS:
        when = "hôm nay" if left <= 1 else f"còn {left} ngày"
        return {"level": "soon", "stage": "pack" if sewn else "sew", "deadline": deadline,
                "text": f"Hạn {step} {_dm(deadline)} – {when}"}
    return None
