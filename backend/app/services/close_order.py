"""Close order: orders (Line + JO) whose every colour has finished sewing,
listed in the week (Monday-Saturday) their last colour's End Sew falls in.
Replaces the weekly Close Order Report Finishing built by hand from the
trackers.

Rules (confirmed with the factory, also in the close-order-report skill and
the old report's formulas):
- group by (Line, JO): quantities are the colours added up, a colour listed
  twice (e.g. in two trackers) counts once;
- an order counts only when ALL its colours have an End Sew date; its End
  Sew is the latest of them, its End Pack the latest colour End Pack (blank
  while any colour is still unpacked);
- an order belongs to the week of its End Sew, whatever an earlier report
  said: one listed early (e.g. before its last colour was sewn) moves to the
  right week when that week is published, keeping Finishing's notes;
- Late duration = working days (Monday-Saturday, minus holidays) from End
  Sew to End Pack - or to today while unpacked - minus 1. More than 3 is
  late; exactly 3 is on time only for WF & TAP orders (Product Category
  WWF_T, unless Finishing overrides it).

The agent's --close-order run (Thursday 15:00) uploads the colour rows;
ingest() then publishes LAST week (Monday-Saturday before the run)."""

import json
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from app.models import CloseOrderItem, CloseOrderRow, CloseOrderWeek, Holiday, Line, User, UserRole
from app.services.progress import normalize_line, owner_from_file, parse_iso, visible_line_numbers

LATE_AFTER_DAYS = 3
# Close order history kept: the most recent published weeks.
HISTORY_WEEKS = 6
# "Tồn tuần trước" looks this far back before the reported week.
CARRY_LOOKBACK_DAYS = 56
# Finishing's notes on an order that carry over when it is listed again.
CARRIED_NOTE_FIELDS = ("remark", "department", "wf", "end_sew_override", "end_pack_override", "pack_cut_override")
# ...and, when an order moves to its End Sew week, whether Finishing removed it.
MOVED_NOTE_FIELDS = (*CARRIED_NOTE_FIELDS, "is_removed", "removed_by", "removed_at")
WF_CATEGORY = "WWF_T"
DEPARTMENTS = ("Cutting", "Sewing", "Washing", "Finishing", "Khác")
ROW_INT_FIELDS = ("order_qty", "cut_qty", "sew_qty", "pack_qty", "pack_cut")


def _text(value, limit: int) -> str | None:
    if value is None:
        return None
    text = unicodedata.normalize("NFC", str(value)).strip()
    return text[:limit] or None


def _int(value) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def canonical_department(value: str | None) -> str | None:
    """"cutting" / " Washing " -> "Cutting" / "Washing"; anything else "Khác"."""
    text = (value or "").strip()
    if not text:
        return None
    for dept in DEPARTMENTS:
        if dept.lower() == text.lower():
            return dept
    return "Khác"


def week_bounds(week_start: date) -> tuple[date, date]:
    """Monday .. Saturday."""
    return week_start, week_start + timedelta(days=5)


def previous_week_start(today: date) -> date:
    return today - timedelta(days=today.weekday() + 7)


def holiday_set(db: Session) -> set[date]:
    return set(db.scalars(select(Holiday.day)).all())


def working_days(start: date, end: date, holidays: set[date]) -> int:
    """Excel NETWORKDAYS.INTL(start, end, 11, holidays): both ends counted,
    Sundays and holidays skipped; negative when end < start."""
    if end < start:
        return -working_days(end, start, holidays)
    count = 0
    day = start
    while day <= end:
        if day.weekday() != 6 and day not in holidays:
            count += 1
        day += timedelta(days=1)
    return count


def late_status(end_sew: date, end_pack: str | None, wf: bool, today: date, holidays: set[date]) -> tuple[int | None, bool]:
    """(Late duration, is late) as in the old report."""
    if end_pack:
        finish = parse_iso(end_pack)
        if finish is None:  # tracker only says "done" - no date to count to
            return None, False
    else:
        finish = today
    duration = working_days(end_sew, finish, holidays) - 1
    late = duration > LATE_AFTER_DAYS or (duration == LATE_AFTER_DAYS and not wf)
    return duration, late


def _min_date_text(values: list[str | None]) -> str | None:
    dates = [d for d in (parse_iso(v) for v in values) if d]
    if dates:
        return min(dates).isoformat()
    return next((v for v in values if v), None)


def closed_orders(rows: list[CloseOrderRow]) -> dict[tuple[str, str], dict]:
    """Every (line, JO) whose colours have all finished sewing."""
    colors: dict[tuple[str, str], dict[str, dict]] = defaultdict(dict)
    for r in rows:
        key = (r.line_number, r.jo.strip().upper())
        ck = (r.color or "").strip().upper()
        c = colors[key].setdefault(
            ck, {"sew": None, "pack_date": None, "pack_any": False, "rows": []}
        )
        # A colour listed in two trackers counts once: the later/filled-in
        # date wins, quantities come from the more advanced copy.
        sew = parse_iso(r.end_sew)
        if sew and (c["sew"] is None or sew > c["sew"]):
            c["sew"] = sew
        pack = parse_iso(r.end_pack)
        if pack and (c["pack_date"] is None or pack > c["pack_date"]):
            c["pack_date"] = pack
        if r.end_pack:
            c["pack_any"] = True
        c["rows"].append(r)

    result = {}
    for key, cols in colors.items():
        if any(c["sew"] is None for c in cols.values()):
            continue
        end_pack = None
        if all(c["pack_any"] for c in cols.values()):
            dates = [c["pack_date"] for c in cols.values() if c["pack_date"]]
            end_pack = max(dates).isoformat() if dates else "Done"
        totals = {f: None for f in ROW_INT_FIELDS}
        all_rows = []
        for c in cols.values():
            best = max(c["rows"], key=lambda r: ((r.pack_qty or 0), (r.sew_qty or 0)))
            all_rows.extend(c["rows"])
            for f in ROW_INT_FIELDS:
                v = getattr(best, f)
                if v is not None:
                    totals[f] = (totals[f] or 0) + v
        result[key] = {
            **totals,
            "end_sew": max(c["sew"] for c in cols.values()),
            "end_pack": end_pack,
            "color_count": len(cols),
            "buyer": next((r.buyer for r in all_rows if r.buyer), None),
            "bpo_date": _min_date_text([r.bpo_date for r in all_rows]),
            "exfty_date": _min_date_text([r.shipment_plan for r in all_rows]),
            "product_category": next((r.product_category for r in all_rows if r.product_category), None),
        }
    return result


REFRESHED_FIELDS = (*ROW_INT_FIELDS, "color_count", "end_pack", "bpo_date", "exfty_date", "product_category")


def ingest(db: Session, payload, now: datetime) -> dict:
    seen: set[str] = set()
    errors = []
    for item in payload.sources:
        file_name = unicodedata.normalize("NFC", item.file_name)[:255]
        seen.add(file_name)
        if item.error:
            errors.append(f"{owner_from_file(file_name)}: {item.error[:300]}")
            continue
        db.execute(delete(CloseOrderRow).where(CloseOrderRow.source_file == file_name))
        rows = []
        for r in item.rows:
            jo = _text(r.jo, 50)
            if not jo or not r.line:
                continue
            rows.append(
                {
                    "source_file": file_name,
                    "line_number": normalize_line(r.line),
                    "jo": jo,
                    "color": _text(r.color, 100),
                    "buyer": _text(r.buyer, 100),
                    "bpo_date": _text(r.bpo_date, 40),
                    "shipment_plan": _text(r.shipment_plan, 40),
                    "end_sew": _text(r.end_sew, 40),
                    "end_pack": _text(r.end_pack, 40),
                    "product_category": _text(r.product_category, 50),
                    **{f: _int(getattr(r, f)) for f in ROW_INT_FIELDS},
                }
            )
        if rows:
            db.execute(insert(CloseOrderRow), rows)
    # Trackers no longer in the folder.
    db.execute(delete(CloseOrderRow).where(CloseOrderRow.source_file.not_in(seen)))
    db.flush()

    week_start = previous_week_start(now.date())
    count = publish_week(db, week_start, now, errors, publish=payload.publish)
    week = db.scalar(select(CloseOrderWeek).where(CloseOrderWeek.week_start == week_start))
    return {
        "week_start": week_start.isoformat(),
        "orders": count,
        "published": bool(week and week.is_published),
        "source_errors": len(errors),
    }


def publish_week(db: Session, week_start: date, now: datetime, errors: list[str], publish: bool = True) -> int:
    """Build last week's list from the trackers. publish=False is the
    Thursday 9:00 draft for Finishing; a published week never goes back to
    draft."""
    start, end = week_bounds(week_start)
    orders = closed_orders(db.scalars(select(CloseOrderRow)).all())

    week = db.scalar(select(CloseOrderWeek).where(CloseOrderWeek.week_start == week_start))
    if week is not None and week.imported:
        # A week taken over from the old Excel report stays as it was.
        _refresh(db, orders)
        return 0

    # Keep what Finishing typed for orders that are still in this week.
    kept = {
        (i.line_number, i.jo.upper()): i
        for i in db.scalars(select(CloseOrderItem).where(CloseOrderItem.week_start == week_start)).all()
    }
    _refresh(db, orders)

    # End Sew decides the week - an earlier report doesn't keep an order out.
    wanted = {key: info for key, info in orders.items() if start <= info["end_sew"] <= end}
    carry, previous = _carried_orders(db, orders, week_start, now.date())

    # Orders listed in another week although their End Sew falls in this one
    # (reported early, e.g. in the old Excel report before the last colour
    # was sewn) move here, bringing Finishing's notes along.
    moved: dict[tuple[str, str], tuple[date, dict]] = {}
    for other in db.scalars(
        select(CloseOrderItem).where(CloseOrderItem.week_start != week_start, CloseOrderItem.is_carry == False)  # noqa: E712
    ).all():
        key = (other.line_number, other.jo.upper())
        if key not in wanted:
            continue
        if key not in moved or other.week_start > moved[key][0]:
            moved[key] = (other.week_start, {f: getattr(other, f) for f in MOVED_NOTE_FIELDS})
        db.delete(other)
    for key, item in kept.items():
        if key not in wanted and key not in carry:
            db.delete(item)
    new_items = []
    for is_carry, group in ((False, wanted), (True, carry)):
        for (line, jo), info in group.items():
            item = kept.get((line, jo))
            if item is not None:
                item.end_sew = info["end_sew"]
                item.buyer = info["buyer"] or item.buyer
                item.is_carry = is_carry
                continue
            row = {"week_start": week_start, "line_number": line, "jo": jo, "source": "web", "is_carry": is_carry, **info}
            if not is_carry and (line, jo) in moved:
                row.update(moved[(line, jo)][1])
            elif is_carry and (line, jo) in previous:
                prev = previous[(line, jo)]
                row.update({f: getattr(prev, f) for f in CARRIED_NOTE_FIELDS})
            new_items.append(row)
    if new_items:
        db.execute(insert(CloseOrderItem), new_items)

    if week is None:
        week = CloseOrderWeek(week_start=week_start, imported=False, is_published=False)
        db.add(week)
    week.is_published = bool(week.is_published) or publish
    week.published_at = now
    week.source_errors = json.dumps(errors, ensure_ascii=False) if errors else None
    if week.is_published:
        db.flush()
        trim_history(db)
    return len(wanted) + len(carry)


def _carried_orders(db: Session, orders: dict, week_start: date, report_day: date) -> tuple[dict, dict]:
    """"Tồn tuần trước" (as in Finishing's old filter tool): orders whose
    last colour finished sewing in the CARRY_LOOKBACK_DAYS before this week
    but are still not packed out on the report day - listed again this
    week even if an earlier week already reported them. Orders Finishing
    removed, or marked packed, are left out. Also returns each order's
    latest earlier listing, whose notes the new listing starts from."""
    previous: dict[tuple[str, str], CloseOrderItem] = {}
    for item in db.scalars(
        select(CloseOrderItem).where(CloseOrderItem.week_start < week_start).order_by(CloseOrderItem.week_start)
    ).all():
        previous[(item.line_number, item.jo.upper())] = item
    look_from = week_start - timedelta(days=CARRY_LOOKBACK_DAYS)
    carry = {}
    for key, info in orders.items():
        if not (look_from <= info["end_sew"] < week_start):
            continue
        prev = previous.get(key)
        if prev is not None and prev.is_removed:
            continue
        # Finishing's corrected date first, then the trackers, then what an
        # earlier listing recorded (e.g. weeks taken over from the old report).
        end_pack = (
            (prev.end_pack_override.isoformat() if prev is not None and prev.end_pack_override else None)
            or info["end_pack"]
            or (prev.end_pack if prev is not None else None)
        )
        packed_on = parse_iso(end_pack)
        if end_pack and (packed_on is None or packed_on <= report_day):  # "Done" counts as packed
            continue
        carry[key] = info
    return carry, previous


def trim_history(db: Session) -> None:
    """Keep the HISTORY_WEEKS most recent published weeks; older weeks are
    deleted."""
    published = db.scalars(
        select(CloseOrderWeek).where(CloseOrderWeek.is_published == True).order_by(CloseOrderWeek.week_start.desc())  # noqa: E712
    ).all()
    for week in published[HISTORY_WEEKS:]:
        db.execute(delete(CloseOrderItem).where(CloseOrderItem.week_start == week.week_start))
        db.delete(week)


def _refresh(db: Session, orders: dict) -> None:
    """Quantities and End pack of orders the web listed follow the trackers
    (manual fields are never touched). Weeks imported from the old Excel
    report keep their own numbers, and a known End pack date is never
    cleared by a tracker that has none."""
    for item in db.scalars(select(CloseOrderItem).where(CloseOrderItem.source == "web")).all():
        info = orders.get((item.line_number, item.jo.upper()))
        if info is None:
            continue
        for field in REFRESHED_FIELDS:
            if field == "end_pack" and info[field] is None and item.end_pack:
                continue
            setattr(item, field, info[field])


def import_weeks(db: Session, payload, now: datetime) -> dict:
    """Take over weeks from the old Excel Close Order Report as they were."""
    total = 0
    for wk in payload.weeks:
        db.execute(delete(CloseOrderItem).where(CloseOrderItem.week_start == wk.week_start))
        rows = []
        for it in wk.items:
            end_sew = parse_iso(it.end_sew)
            jo = _text(it.jo, 50)
            if not jo or not it.line or end_sew is None:
                continue
            rows.append(
                {
                    "week_start": wk.week_start,
                    "line_number": normalize_line(it.line),
                    "jo": jo.upper(),
                    "buyer": _text(it.buyer, 100),
                    "color_count": None,
                    "order_qty": _int(it.order_qty),
                    "cut_qty": _int(it.cut_qty),
                    "sew_qty": _int(it.sew_qty),
                    "pack_qty": _int(it.pack_qty),
                    "pack_cut": _int(it.pack_cut),
                    "bpo_date": _text(it.bpo_date, 40),
                    "exfty_date": _text(it.exfty_date, 40),
                    "end_sew": end_sew,
                    "end_pack": _text(it.end_pack, 40),
                    "product_category": None,
                    "wf": bool(it.wf),
                    "remark": _text(it.remark, 1000),
                    "department": canonical_department(it.department),
                    "source": "import",
                }
            )
        if rows:
            db.execute(insert(CloseOrderItem), rows)
        week = db.scalar(select(CloseOrderWeek).where(CloseOrderWeek.week_start == wk.week_start))
        if week is None:
            week = CloseOrderWeek(week_start=wk.week_start)
            db.add(week)
        week.imported = True
        week.is_published = True
        week.published_at = now
        week.source_errors = None
        total += len(rows)
    return {"weeks": len(payload.weeks), "orders": total}


def _effective_wf(item: CloseOrderItem) -> bool:
    if item.wf is not None:
        return item.wf
    return (item.product_category or "").strip().upper() == WF_CATEGORY


def effective_dates(item: CloseOrderItem) -> tuple[date, str | None]:
    """End Sew / End Pack after Finishing's corrections."""
    end_sew = item.end_sew_override or item.end_sew
    end_pack = item.end_pack_override.isoformat() if item.end_pack_override else item.end_pack
    return end_sew, end_pack


def effective_late(item: CloseOrderItem, today: date, holidays: set[date]) -> tuple[int | None, bool, int | None, bool]:
    """(duration, late, formula duration, formula late). The formula runs on
    the corrected dates; Finishing's own duration feeds the late rule unless
    late/on time is also set by hand."""
    wf = _effective_wf(item)
    end_sew, end_pack = effective_dates(item)
    auto_duration, auto_late = late_status(end_sew, end_pack, wf, today, holidays)
    duration = item.duration_override if item.duration_override is not None else auto_duration
    if item.late_override is not None:
        late = item.late_override
    elif item.duration_override is not None:
        late = duration > LATE_AFTER_DAYS or (duration == LATE_AFTER_DAYS and not wf)
    else:
        late = auto_late
    return duration, late, auto_duration, auto_late


# What Finishing changed by hand stays Finishing's business: for anyone else
# the corrected values are simply the values (no originals, no flags).
HAND_EDIT_FIELDS = {
    "tracker_pack_cut": "pack_cut",
    "tracker_end_sew": "end_sew",
    "tracker_end_pack": "end_pack",
    "auto_late_duration": "late_duration",
    "auto_is_late": "is_late",
}
HAND_EDIT_FLAGS = ("pack_cut_manual", "end_sew_manual", "end_pack_manual", "duration_manual", "late_manual", "is_carry")


def item_out(item: CloseOrderItem, lines: dict[str, Line], today: date, holidays: set[date], reveal_edits: bool = True) -> dict:
    out = _item_out(item, lines, today, holidays)
    if not reveal_edits:
        for field, shown in HAND_EDIT_FIELDS.items():
            out[field] = out[shown]
        for flag in HAND_EDIT_FLAGS:
            out[flag] = False
    return out


def _item_out(item: CloseOrderItem, lines: dict[str, Line], today: date, holidays: set[date]) -> dict:
    line = lines.get(item.line_number)
    wf = _effective_wf(item)
    duration, late, auto_duration, auto_late = effective_late(item, today, holidays)
    return {
        "id": item.id,
        "line_number": item.line_number,
        "executive_name": line.executive_name if line else None,
        "pu_group": line.pu_group.value if line else None,
        "buyer": item.buyer,
        "jo": item.jo,
        "color_count": item.color_count,
        "order_qty": item.order_qty,
        "cut_qty": item.cut_qty,
        "sew_qty": item.sew_qty,
        "pack_qty": item.pack_qty,
        "pack_cut": item.pack_cut_override if item.pack_cut_override is not None else item.pack_cut,
        "tracker_pack_cut": item.pack_cut,
        "pack_cut_manual": item.pack_cut_override is not None,
        "bpo_date": item.bpo_date,
        "exfty_date": item.exfty_date,
        "end_sew": effective_dates(item)[0],
        "end_pack": effective_dates(item)[1],
        "tracker_end_sew": item.end_sew,
        "tracker_end_pack": item.end_pack,
        "end_sew_manual": item.end_sew_override is not None,
        "end_pack_manual": item.end_pack_override is not None,
        "late_duration": duration,
        "is_late": late,
        "auto_late_duration": auto_duration,
        "auto_is_late": auto_late,
        "duration_manual": item.duration_override is not None,
        "late_manual": item.late_override is not None,
        "is_removed": item.is_removed,
        "is_carry": item.is_carry,
        "removed_by": item.removed_by,
        "removed_at": item.removed_at,
        "wf": wf,
        # Set explicitly - by Finishing, or taken over from the old report.
        "wf_manual": item.wf is not None,
        "product_category": item.product_category,
        "remark": item.remark,
        "department": item.department,
        "updated_by": item.updated_by,
        "updated_at": item.updated_at,
    }


def _line_map(db: Session) -> dict[str, Line]:
    return {ln.line_number.strip().upper(): ln for ln in db.scalars(select(Line)).all()}


def list_weeks(db: Session, user: User, today: date) -> list[dict]:
    allowed = visible_line_numbers(db, user)
    holidays = holiday_set(db)
    counts: dict[date, list[int]] = defaultdict(lambda: [0, 0])
    for item in db.scalars(select(CloseOrderItem)).all():
        if item.is_removed or (allowed is not None and item.line_number not in allowed):
            continue
        _, late, _, _ = effective_late(item, today, holidays)
        counts[item.week_start][0] += 1
        counts[item.week_start][1] += int(late)
    stmt = select(CloseOrderWeek).order_by(CloseOrderWeek.week_start.desc())
    if user.role != UserRole.finishing:
        stmt = stmt.where(CloseOrderWeek.is_published == True)  # noqa: E712
    weeks = db.scalars(stmt).all()
    return [
        {
            "week_start": w.week_start,
            "week_end": week_bounds(w.week_start)[1],
            "published_at": w.published_at,
            "imported": w.imported,
            "is_published": w.is_published,
            "total": counts[w.week_start][0],
            "late": counts[w.week_start][1],
        }
        for w in weeks
    ]


def week_view(db: Session, user: User, week_start: date, today: date) -> dict | None:
    week = db.scalar(select(CloseOrderWeek).where(CloseOrderWeek.week_start == week_start))
    # The Thursday-morning draft exists only for Finishing until 15:00.
    if week is None or (not week.is_published and user.role != UserRole.finishing):
        return None
    allowed = visible_line_numbers(db, user)
    lines = _line_map(db)
    holidays = holiday_set(db)
    # Removed orders are Finishing's business: nobody else even receives
    # them (the report reads as if they were never there).
    show_removed = user.role == UserRole.finishing
    items = [
        item_out(i, lines, today, holidays, reveal_edits=show_removed)
        for i in db.scalars(select(CloseOrderItem).where(CloseOrderItem.week_start == week_start)).all()
        if (allowed is None or i.line_number in allowed) and (show_removed or not i.is_removed)
    ]
    items.sort(key=lambda r: (r["executive_name"] is None, r["pu_group"] or "", r["line_number"], r["end_sew"], r["jo"]))
    return {
        "week_start": week.week_start,
        "week_end": week_bounds(week.week_start)[1],
        "published_at": week.published_at,
        "imported": week.imported,
        "is_published": week.is_published,
        "source_errors": json.loads(week.source_errors) if week.source_errors else [],
        "can_edit": user.role in (UserRole.sep, UserRole.finishing),
        # Late duration / late-ontime overrides and removing orders.
        "can_override": user.role == UserRole.finishing,
        "can_edit_holidays": user.role == UserRole.sep,
        "departments": list(DEPARTMENTS),
        "items": items,
    }
