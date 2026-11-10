"""Tiến độ đơn hàng: the running orders copied each morning from everyone's
"bảng tiến độ" Excel trackers (by the agent in progress-agent/ on an office
PC that syncs the SharePoint folder), replacing the hand-made "daily" file.

The agent only reads the files and keeps rows whose Pack-cut is not 0; the
rules that decide what people see - line name clean-up, which Executive a
line belongs to, the "late" days and which orders are hidden - live here so
they can change without reinstalling the agent."""

import re
import unicodedata
from datetime import date, datetime, timedelta

from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from app.models import Line, ProgressNote, ProgressOrder, ProgressSource, User, UserRole

# An order drops off the page once its Shipment plan is more than this many
# days in the past, or the tracker marks the shipment "Done". Anything still
# showing after that can be hidden by hand with "Đóng đơn".
SHIPMENT_GRACE_DAYS = 7
# Remarks/closed flags for orders no tracker has listed for this long are
# deleted, so the table doesn't grow forever.
NOTE_RETENTION_DAYS = 60

UNASSIGNED_EXECUTIVE = "Chưa phân Executive"

_LINE_RE = re.compile(r"(?:LINE\s*)?0*(\d{1,3})\s*(?:A|AB|A\s*B)?")
_TRACKER_WORDS_RE = re.compile(r"b[aả]ng\s*ti[eế]n\s*[dđ][oộ]", re.IGNORECASE)

ORDER_TEXT_LIMITS = {
    "line_raw": 50,
    "buyer": 100,
    "jo": 50,
    "color": 100,
    "bpo_date": 40,
    "shipment_plan": 40,
    "order_carton": 40,
    "start_sew": 40,
    "end_sew": 40,
    "end_pack": 40,
    "product_category": 50,
    "cust_style_no": 100,
}
ORDER_INT_FIELDS = ("order_qty", "allocate_qty", "cut_qty", "sew_qty", "pack_qty")


def normalize_line(raw: str) -> str:
    """Trackers spell the same line several ways ("06A", "6AB", "06AB");
    the web's Cấu hình Line uses "06AB"."""
    text = unicodedata.normalize("NFC", str(raw)).strip().upper()
    m = _LINE_RE.fullmatch(text)
    if m:
        return f"{int(m.group(1)):02d}AB"
    return text[:20]


def owner_from_file(file_name: str) -> str:
    """"Bảng tiến độ -Hương.xlsx" -> "Hương", "BẢNG TIẾN ĐỘ - THU.xlsx" -> "Thu"."""
    stem = unicodedata.normalize("NFC", file_name).rsplit(".", 1)[0].replace("_", " ")
    name = _TRACKER_WORDS_RE.sub("", stem).strip(" -_.")
    if not name:
        name = stem.strip()
    if name.isupper():
        name = name.title()
    return name[:100]


def make_order_key(line_number: str, jo: str, color: str | None) -> str:
    return f"{line_number}|{jo.strip().upper()}|{(color or '').strip().upper()}"[:200]


def parse_iso(value: str | None) -> date | None:
    if not value or len(value) != 10:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def networkdays_mon_sat(start: date, end: date) -> int:
    """Excel NETWORKDAYS.INTL(start, end, 11): working days counted inclusive
    of both ends, Sunday the only day off; negative when end < start."""
    if end < start:
        return -networkdays_mon_sat(end, start)
    days = (end - start).days + 1
    full_weeks, extra = divmod(days, 7)
    count = full_weeks * 6
    for i in range(extra):
        if (start + timedelta(days=full_weeks * 7 + i)).weekday() != 6:
            count += 1
    return count


def late_days(end_sew: str | None, end_pack: str | None, today: date) -> tuple[int | None, str | None]:
    """The daily file's "late" column: days since End sew while packing is
    still open, or working days End sew -> End pack (minus one) once done.
    Returns (days, label); label is set when there is no number to show."""
    if not end_sew:
        return None, "Chưa end sew"
    sew = parse_iso(end_sew)
    if sew is None:
        return None, None
    if not end_pack:
        return (today - sew).days, None
    pack = parse_iso(end_pack)
    if pack is None:
        return None, None
    return networkdays_mon_sat(sew, pack) - 1, None


def auto_hidden_reason(shipment_plan: str | None, today: date) -> str | None:
    if not shipment_plan:
        return None
    if shipment_plan.strip().lower().startswith("done"):
        return "done"
    ship = parse_iso(shipment_plan)
    if ship is not None and ship < today - timedelta(days=SHIPMENT_GRACE_DAYS):
        return "shipped"
    return None


def _clean_text(value, limit: int) -> str | None:
    if value is None:
        return None
    text = unicodedata.normalize("NFC", str(value)).strip()
    return text[:limit] or None


def _clean_int(value) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def ingest(db: Session, payload, now: datetime) -> dict:
    """Store one agent run. A tracker read successfully has all its rows
    replaced; one that failed keeps yesterday's rows and records the error;
    a tracker no longer in the folder is removed."""
    existing = {s.file_name: s for s in db.scalars(select(ProgressSource)).all()}
    seen: set[str] = set()
    inserted = 0

    def source_row(file_name: str, kind: str) -> ProgressSource:
        src = existing.get(file_name)
        if src is None:
            src = ProgressSource(file_name=file_name, kind=kind, owner=owner_from_file(file_name), row_count=0)
            db.add(src)
            existing[file_name] = src
        src.kind = kind
        src.last_attempt_at = now
        return src

    for item in payload.sources:
        file_name = unicodedata.normalize("NFC", item.file_name)[:255]
        seen.add(file_name)
        src = source_row(file_name, "tracker")
        src.owner = owner_from_file(file_name)
        src.file_modified_at = item.modified_at
        if item.error:
            src.last_error = item.error[:2000]
            continue
        db.execute(delete(ProgressOrder).where(ProgressOrder.source_file == file_name))
        rows = []
        for r in item.rows:
            jo = _clean_text(r.jo, ORDER_TEXT_LIMITS["jo"])
            pack_cut = _clean_int(r.pack_cut)
            if not jo or not r.line or not pack_cut:
                continue
            line_number = normalize_line(r.line)
            color = _clean_text(r.color, ORDER_TEXT_LIMITS["color"])
            row = {
                "source_file": file_name,
                "order_key": make_order_key(line_number, jo, color),
                "line_number": line_number,
                "pack_cut": pack_cut,
            }
            for field, limit in ORDER_TEXT_LIMITS.items():
                if field not in row:
                    row[field] = _clean_text(getattr(r, field if field != "line_raw" else "line"), limit)
            row["jo"] = jo
            row["color"] = color
            for field in ORDER_INT_FIELDS:
                row[field] = _clean_int(getattr(r, field))
            rows.append(row)
        if rows:
            db.execute(insert(ProgressOrder), rows)
        inserted += len(rows)
        src.row_count = len(rows)
        src.last_ok_at = now
        src.last_error = None

    if payload.plan_file:
        plan_name = unicodedata.normalize("NFC", payload.plan_file)[:255]
        seen.add(plan_name)
        src = source_row(plan_name, "plan")
        src.owner = "PRODUCTION PLAN"
        src.file_modified_at = payload.plan_modified_at
        src.row_count = payload.plan_jo_count
        if payload.plan_error:
            src.last_error = payload.plan_error[:2000]
        else:
            src.last_ok_at = now
            src.last_error = None

    for file_name, src in list(existing.items()):
        if file_name not in seen:
            db.execute(delete(ProgressOrder).where(ProgressOrder.source_file == file_name))
            db.delete(src)

    live_keys = select(ProgressOrder.order_key)
    db.execute(
        delete(ProgressNote)
        .where(ProgressNote.updated_at < now - timedelta(days=NOTE_RETENTION_DAYS))
        .where(ProgressNote.order_key.not_in(live_keys))
    )
    return {"sources": len(payload.sources), "rows": inserted}


def _line_map(db: Session) -> dict[str, Line]:
    return {line.line_number.strip().upper(): line for line in db.scalars(select(Line)).all()}


def visible_line_numbers(db: Session, user: User) -> set[str] | None:
    """None = every line; an Executive only sees their own lines' orders."""
    if user.role != UserRole.executive:
        return None
    return {
        ln.strip().upper()
        for ln in db.scalars(select(Line.line_number).where(Line.executive_name == user.executive_name)).all()
    }


def build_view(db: Session, user: User, today: date, include_hidden: bool) -> dict:
    lines = _line_map(db)
    allowed = visible_line_numbers(db, user)
    notes = {n.order_key: n for n in db.scalars(select(ProgressNote)).all()}
    owners = {s.file_name: s.owner for s in db.scalars(select(ProgressSource)).all()}

    orders = []
    hidden = {"closed": 0, "shipped": 0, "done": 0}
    for o in db.scalars(select(ProgressOrder)).all():
        if allowed is not None and o.line_number not in allowed:
            continue
        note = notes.get(o.order_key)
        reason = "closed" if note is not None and note.is_closed else auto_hidden_reason(o.shipment_plan, today)
        if reason:
            hidden[reason] += 1
            if not include_hidden:
                continue
        line = lines.get(o.line_number)
        late, late_label = late_days(o.end_sew, o.end_pack, today)
        orders.append(
            {
                "order_key": o.order_key,
                "line_number": o.line_number,
                "executive_name": line.executive_name if line else None,
                "pu_group": line.pu_group.value if line else None,
                "source_owner": owners.get(o.source_file, o.source_file),
                "buyer": o.buyer,
                "jo": o.jo,
                "color": o.color,
                "cust_style_no": o.cust_style_no,
                "product_category": o.product_category,
                "bpo_date": o.bpo_date,
                "shipment_plan": o.shipment_plan,
                "order_carton": o.order_carton,
                "start_sew": o.start_sew,
                "end_sew": o.end_sew,
                "end_pack": o.end_pack,
                "order_qty": o.order_qty,
                "allocate_qty": o.allocate_qty,
                "cut_qty": o.cut_qty,
                "sew_qty": o.sew_qty,
                "pack_qty": o.pack_qty,
                "pack_cut": o.pack_cut,
                "late": late,
                "late_label": late_label,
                "ex_remark": note.ex_remark if note else None,
                "fin_remark": note.fin_remark if note else None,
                "hidden_reason": reason,
                "closed_by": note.closed_by if note and note.is_closed else None,
                "closed_at": note.closed_at if note and note.is_closed else None,
            }
        )

    orders.sort(
        key=lambda r: (
            r["executive_name"] is None,
            r["pu_group"] or "",
            r["line_number"],
            r["start_sew"] or "9999",
            r["jo"],
            r["color"] or "",
        )
    )

    sources = db.scalars(select(ProgressSource).order_by(ProgressSource.kind.desc(), ProgressSource.owner)).all()
    last_run = max((s.last_attempt_at for s in sources), default=None)
    return {
        "updated_at": last_run,
        "shipment_grace_days": SHIPMENT_GRACE_DAYS,
        "hidden_counts": hidden,
        "sources": [
            {
                "file_name": s.file_name,
                "kind": s.kind,
                "owner": s.owner,
                "file_modified_at": s.file_modified_at,
                "last_ok_at": s.last_ok_at,
                "last_error": s.last_error,
                "row_count": s.row_count,
                "ok_on_last_run": s.last_error is None and s.last_ok_at == s.last_attempt_at,
            }
            for s in sources
        ],
        "orders": orders,
    }


def can_edit_order(db: Session, user: User, order_key: str) -> bool | None:
    """None if no current order has this key; otherwise whether the user may
    add remarks to / close it."""
    line_numbers = set(
        db.scalars(select(ProgressOrder.line_number).where(ProgressOrder.order_key == order_key)).all()
    )
    if not line_numbers:
        return None
    allowed = visible_line_numbers(db, user)
    return allowed is None or bool(line_numbers & allowed)
