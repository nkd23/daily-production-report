"""What the Zalo bot posts by itself in the factory's group chat, and the
order lists behind it. The bot calls people by the name on their "bảng
tiến độ" file ("Hương ơi, ..."), since that is who keeps the order.

- Each working morning, after the agent's Tiến độ upload (9:00): orders
  about to go late for Close order, grouped by whose tracker they are in.
- Thursday 9:00: the Close order draft and what is still missing (late
  orders without Department in charge / Remark), again around 14:00 if
  anything is still missing (Vercel Cron).
- Data problems: a tracker that can't be read or hasn't been saved for
  days (to its owner), lines with no orders at all, the office-PC agent
  not running in the morning or on Thursday.

"About to go late" uses the Close order rule (close_order.late_status):
Late duration = working days from the last colour's End Sew to End Pack,
minus 1; 3 is already late (4 for WF & TAP). Until an order is packed out
it is counted to today, so days_left = how many working days, today
included, are left to pack it out on time."""

import logging
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    CloseOrderItem,
    CloseOrderRow,
    CloseOrderWeek,
    Line,
    ProgressNote,
    ProgressOrder,
    ProgressSource,
    ZaloState,
)
from app.services.close_order import (
    CARRY_LOOKBACK_DAYS,
    LATE_AFTER_DAYS,
    WF_CATEGORY,
    _line_map,
    holiday_set,
    item_out,
    previous_week_start,
    week_bounds,
    working_days,
)
from app.services.progress import normalize_line, owner_from_file, parse_iso
from app.services.zalo_client import send_text

log = logging.getLogger(__name__)

# A tracker nobody has saved for this long is probably not being kept up.
STALE_TRACKER_DAYS = 4
LIST_LIMIT = 12
CLOSE_ORDER_PATH = "/tien-do/close-order"
GROUP_KEY = "group"
NO_OWNER = "Chưa rõ người phụ trách"


# ---------------------------------------------------------------- helpers

# Bits of a tracker's file name that aren't the person: "(1)", dates, copy
# numbers, "daCapNhat"...  "THU_daCapNhat_2026-11-21" -> "Thu", "Hải 1" -> "Hải".
_NAME_NOISE_RE = re.compile(r"\(\d+\)|\d{1,4}(?:[-_./]\d{1,4})*")
_NAME_NOISE_WORDS = {"dacapnhat", "capnhat", "copy", "final", "new", "moi", "update", "updated", "ban", "sao"}


def fold(text: str) -> str:
    """"Sắp LATE" -> "sap late" (no accents, lower case, single spaces)."""
    text = unicodedata.normalize("NFD", text.replace("đ", "d").replace("Đ", "D"))
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return " ".join(text.lower().split())


def person_name(file_name_or_owner: str) -> str:
    """The person a tracker belongs to, as the bot calls them."""
    owner = owner_from_file(file_name_or_owner) if "." in file_name_or_owner else file_name_or_owner
    text = _NAME_NOISE_RE.sub(" ", owner)
    text = re.sub(r"[_()\[\]]", " ", text)
    words = []
    skip = 0
    tokens = text.split()
    for i, word in enumerate(tokens):
        if skip:
            skip -= 1
            continue
        folded = fold(word)
        # "đã cập nhật" written out as three words
        if folded == "da" and [fold(w) for w in tokens[i + 1 : i + 3]] == ["cap", "nhat"]:
            skip = 2
            continue
        if folded in _NAME_NOISE_WORDS:
            continue
        words.append(word)
    name = " ".join(words).strip(" -_.()") or owner
    return name.title() if name.isupper() else name

def state_get(db: Session, key: str) -> str | None:
    row = db.get(ZaloState, key)
    return row.value if row else None


def state_set(db: Session, key: str, value: str | None, now: datetime) -> None:
    row = db.get(ZaloState, key)
    if row is None:
        db.add(ZaloState(key=key, value=value, updated_at=now))
    else:
        row.value = value
        row.updated_at = now


def group_chat_id(db: Session) -> str | None:
    return state_get(db, GROUP_KEY) or None


def post(db: Session, text: str) -> bool:
    """Post to the registered group chat (nothing happens before a group
    has been registered with "dangky <code>")."""
    chat_id = group_chat_id(db)
    if not chat_id:
        log.info("zalo: no group registered, not posted:\n%s", text)
        return False
    return send_text(chat_id, text)


def short_line(line_number: str) -> str:
    """"28AB" -> "28" (what people call the line)."""
    return line_number[:-2] if line_number.upper().endswith("AB") else line_number


def dm(d: date | None) -> str:
    return f"{d.day:02d}/{d.month:02d}" if d else "?"


def is_working_day(day: date, holidays: set[date]) -> bool:
    return day.weekday() != 6 and day not in holidays


def close_order_link() -> str:
    url = get_settings().app_url
    return f"{url}{CLOSE_ORDER_PATH}" if url else ""


def _bullets(lines: list[str], limit: int = LIST_LIMIT) -> list[str]:
    shown = [f"• {t}" for t in lines[:limit]]
    if len(lines) > limit:
        shown.append(f"… và {len(lines) - limit} đơn nữa")
    return shown


# ------------------------------------------------- orders about to go late

def open_close_orders(db: Session, today: date, allowed: set[str] | None = None) -> list[dict]:
    """Orders (Line + JO) whose colours have all finished sewing but are not
    packed out yet, from this morning's Tiến độ, with their Close order
    countdown. Orders closed on Tiến độ, removed or marked packed by
    Finishing on Close order are left out, and so are orders sewn more
    than CARRY_LOOKBACK_DAYS ago (rows a tracker never cleaned up)."""
    holidays = holiday_set(db)
    closed_keys = set(db.scalars(select(ProgressNote.order_key).where(ProgressNote.is_closed == True)).all())  # noqa: E712
    groups: dict[tuple[str, str], list[ProgressOrder]] = defaultdict(list)
    for r in db.scalars(select(ProgressOrder)).all():
        if r.order_key in closed_keys or (allowed is not None and r.line_number not in allowed):
            continue
        groups[(r.line_number, r.jo.strip().upper())].append(r)
    if not groups:
        return []

    # Tiến độ only keeps colours still being packed; the colours already
    # packed out are in the last Close order upload (all colours).
    weekly: dict[tuple[str, str], list[CloseOrderRow]] = defaultdict(list)
    for r in db.scalars(select(CloseOrderRow)).all():
        key = (r.line_number, r.jo.strip().upper())
        if key in groups:
            weekly[key].append(r)
    items: dict[tuple[str, str], CloseOrderItem] = {}
    for i in db.scalars(select(CloseOrderItem).order_by(CloseOrderItem.week_start)).all():
        items[(i.line_number, i.jo.upper())] = i

    out = []
    for key, rows in groups.items():
        sews = [parse_iso(r.end_sew) for r in rows]
        if any(s is None for s in sews):
            continue  # a colour is still sewing
        running_colors = {(r.color or "").strip().upper() for r in rows}
        other = [r for r in weekly.get(key, []) if (r.color or "").strip().upper() not in running_colors]
        # A colour with nothing sewn nor packed last Thursday and not running
        # now hasn't started: the order isn't fully sewn.
        if any(not r.end_sew and not r.end_pack for r in other):
            continue
        item = items.get(key)
        if item is not None and (item.is_removed or item.end_pack_override):
            continue
        end_sew = max([s for s in sews if s] + [d for d in (parse_iso(r.end_sew) for r in other) if d])
        if item is not None and item.end_sew_override and item.end_sew_override >= end_sew:
            end_sew = item.end_sew_override
        # Rows sewn long ago and never cleaned out of a tracker are junk, not
        # late orders - the same window Close order carries orders over.
        if end_sew < today - timedelta(days=CARRY_LOOKBACK_DAYS):
            continue
        if item is not None and item.wf is not None:
            wf = item.wf
        else:
            wf = any((r.product_category or "").strip().upper() == WF_CATEGORY for r in rows)
        duration = working_days(end_sew, today, holidays) - 1
        late_at = LATE_AFTER_DAYS + (1 if wf else 0)
        out.append(
            {
                "line_number": key[0],
                "jo": rows[0].jo.strip(),
                "buyer": next((r.buyer for r in rows if r.buyer), None),
                "end_sew": end_sew,
                "duration": duration,
                "days_left": late_at - duration,
                "wf": wf,
                "colors_open": len(rows),
                "pack_cut": sum(r.pack_cut or 0 for r in rows),
                # Whose tracker the order is in - the person the bot calls.
                "owner": person_name(rows[0].source_file),
            }
        )
    out.sort(key=lambda o: (o["days_left"], o["line_number"], o["jo"]))
    return out


def _order_line(o: dict) -> str:
    buyer = f" ({o['buyer']})" if o["buyer"] else ""
    wf = " · WF" if o["wf"] else ""
    return f"L{short_line(o['line_number'])} {o['jo']}{buyer} – End Sew {dm(o['end_sew'])} – Pack-Cut {o['pack_cut']:,}{wf}"


def _by_owner(orders: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for o in orders:
        grouped[o["owner"] or NO_OWNER].append(o)
    return grouped


def risk_text(orders: list[dict], today: date, full: bool = False) -> str | None:
    """The morning warning (full=False: late orders only counted) or the
    answer to "sắp late" (full=True: late orders listed too), addressed to
    each tracker's owner."""
    due = [o for o in orders if o["days_left"] in (1, 2)]
    late = [o for o in orders if o["days_left"] <= 0]
    if not due and not late:
        return None
    parts = [f"⏰ Close order – đơn sắp late ({dm(today)})"]
    shown = due + (late if full else [])
    grouped = _by_owner(shown)
    # Whoever has the most orders due today first.
    owners = sorted(grouped, key=lambda w: (w == NO_OWNER, -sum(o["days_left"] == 1 for o in grouped[w]), w))
    for owner in owners:
        mine = grouped[owner]
        today_due = [o for o in mine if o["days_left"] == 1]
        next_due = [o for o in mine if o["days_left"] == 2]
        mine_late = sorted((o for o in mine if o["days_left"] <= 0), key=lambda o: -o["duration"])
        parts += ["", f"{owner} ơi 👇" if owner != NO_OWNER else f"{NO_OWNER}:"]
        if today_due:
            parts += [f"🔴 Phải End pack HÔM NAY ({len(today_due)}):", *_bullets([_order_line(o) for o in today_due])]
        if next_due:
            parts += [f"🟠 Hạn ngày làm việc tiếp theo ({len(next_due)}):", *_bullets([_order_line(o) for o in next_due])]
        if mine_late:
            parts += [
                f"⚫ Đã late, chưa End pack ({len(mine_late)}):",
                *_bullets([f"{_order_line(o)} – {o['duration']} ngày" for o in mine_late]),
            ]
    if late and not full:
        counts = Counter(o["owner"] or NO_OWNER for o in late)
        detail = ", ".join(f"{w} {n}" for w, n in counts.most_common())
        parts += ["", f"⚫ Đã late, chưa End pack: {len(late)} đơn ({detail}). Tag bot và nhắn \"sắp late\" để xem hết."]
    return "\n".join(parts)


# ------------------------------------------------------ Thursday checklist

def week_items(db: Session, week_start: date, today: date) -> list[dict]:
    lines = _line_map(db)
    holidays = holiday_set(db)
    items = db.scalars(select(CloseOrderItem).where(CloseOrderItem.week_start == week_start)).all()
    return [item_out(i, lines, today, holidays, reveal_edits=False) for i in items if not i.is_removed]


def _item_label(i: dict) -> str:
    return f"L{short_line(i['line_number'])} {i['jo']}"


def checklist_text(db: Session, week_start: date, today: date, reminder: bool = False) -> str | None:
    """The Thursday draft and what Finishing still has to fill in; for the
    14:00 reminder None when nothing is missing."""
    items = week_items(db, week_start, today)
    late = [i for i in items if i["is_late"]]
    no_dept = [i for i in late if not i["department"]]
    no_remark = [i for i in late if not i["remark"]]
    if reminder and not (no_dept or no_remark):
        return None
    _, end = week_bounds(week_start)
    if reminder:
        parts = [f"⏰ Finishing ơi, còn khoảng 1 tiếng trước 15:00 – Close order tuần {dm(week_start)}–{dm(end)} vẫn còn thiếu:"]
    else:
        carry = sum(1 for i in items if i["is_carry"])
        summary = f"{len(items)} JO · {len(late)} late" + (f" · {carry} tồn tuần trước" if carry else "")
        parts = [f"📝 Bản nháp Close order tuần {dm(week_start)}–{dm(end)} (công bố lúc 15:00)", summary]
        if no_dept or no_remark:
            parts += ["", "Finishing ơi, cần điền trước 15:00:"]
    if no_dept:
        parts += [f"▸ {len(no_dept)} đơn late chưa có Department in charge:", *_bullets([_item_label(i) for i in no_dept])]
    if no_remark:
        parts += [f"▸ {len(no_remark)} đơn late chưa có Remark:", *_bullets([_item_label(i) for i in no_remark])]
    if late and not (no_dept or no_remark):
        parts += ["", "✅ Các đơn late đều đã có Department và Remark."]
    link = close_order_link()
    if link:
        parts += ["", f"👉 {link}"]
    return "\n".join(parts)


# ------------------------------------------------------------ data checks

def progress_problems(db: Session, now: datetime) -> list[str]:
    problems = []
    sources = db.scalars(select(ProgressSource)).all()
    for src in sorted(sources, key=lambda s: s.owner):
        if src.last_error:
            if src.kind == "plan":
                problems.append(f"Không đọc được file PRODUCTION PLAN: {src.last_error[:150]}")
            else:
                problems.append(f"{person_name(src.owner)} ơi, bot không mở được bảng tiến độ của bạn ({src.last_error[:150]}). Bạn kiểm tra lại file nhé.")
        elif src.kind == "tracker" and src.file_modified_at and src.file_modified_at < now - timedelta(days=STALE_TRACKER_DAYS):
            problems.append(f"{person_name(src.owner)} ơi, bảng tiến độ của bạn chưa được lưu lại từ {dm(src.file_modified_at.date())}.")
    with_orders = {normalize_line(n) for n in db.scalars(select(ProgressOrder.line_number).distinct()).all()}
    missing = sorted(
        short_line(normalize_line(ln.line_number))
        for ln in db.scalars(select(Line).where(Line.is_active == True)).all()  # noqa: E712
        if normalize_line(ln.line_number) not in with_orders
    )
    if missing:
        problems.append(f"Chưa thấy đơn nào của line {', '.join(missing)} trong các bảng tiến độ – thiếu file?")
    return problems


def _post_once(db: Session, key: str, text: str, now: datetime) -> None:
    if state_get(db, key) is not None:
        return
    post(db, text)
    state_set(db, key, now.isoformat(timespec="minutes"), now)


# ------------------------------------------------------------- the triggers

def after_progress_ingest(db: Session, now: datetime) -> None:
    """Right after the 9:00 Tiến độ upload."""
    today = now.date()
    holidays = holiday_set(db)

    # Late warning - once a working day, even if the agent is run again.
    risk_key = f"risk:{today.isoformat()}"
    if is_working_day(today, holidays) and state_get(db, risk_key) is None:
        text = risk_text(open_close_orders(db, today), today)
        if text:
            post(db, text)
        state_set(db, risk_key, "sent" if text else "none", now)

    # Data problems - only when something changed.
    problems = progress_problems(db, now)
    signature = "\n".join(problems)
    previous = state_get(db, "health:progress") or ""
    if signature != previous:
        if problems:
            text = "⚠️ Dữ liệu Tiến độ sáng nay:\n" + "\n".join(f"• {p}" for p in problems)
            text += "\n(Bot sẽ báo lại khi có thay đổi.)"
        else:
            text = "✅ Dữ liệu Tiến độ đã đầy đủ trở lại."
        post(db, text)
        state_set(db, "health:progress", signature, now)


def after_close_order_ingest(db: Session, now: datetime, week_start: date, publish: bool, errors: list[str]) -> None:
    if not publish:
        text = checklist_text(db, week_start, now.date())
        if text:
            post(db, text)
    if errors:
        lines = []
        for e in errors[:10]:
            owner, _, msg = e.partition(": ")
            lines.append(f"• {person_name(owner)} ơi, bot không mở được bảng tiến độ của bạn ({msg[:150]})" if msg else f"• {e[:150]}")
        when = "bản công bố 15:00" if publish else "bản nháp 9:00"
        post(db, f"⚠️ Close order ({when}) thiếu dữ liệu {len(errors)} file:\n" + "\n".join(lines))


def cron_progress_check(db: Session, now: datetime) -> str:
    """~10:00 every working day: did the 9:00 upload arrive?"""
    today = now.date()
    if not is_working_day(today, holiday_set(db)):
        return "day off"
    last = db.scalar(select(ProgressSource.last_attempt_at).order_by(ProgressSource.last_attempt_at.desc()).limit(1))
    if last is not None and last.date() >= today:
        return "ok"
    since = f" (lần cuối {dm(last.date())} {last:%H:%M})" if last else ""
    _post_once(
        db,
        f"alert:no-progress:{today.isoformat()}",
        f"🔴 Sáng nay ({dm(today)}) web chưa nhận được dữ liệu Tiến độ{since}, nên chưa có cảnh báo sắp late. "
        "Máy công ty có đang bật và chạy lịch DayTienDo 9:00 không?",
        now,
    )
    return "alerted"


def cron_draft_reminder(db: Session, now: datetime) -> str:
    """~14:00 Thursday: remind about the draft's gaps."""
    today = now.date()
    if today.weekday() != 3:
        return "not thursday"
    week_start = previous_week_start(today)
    week = db.scalar(select(CloseOrderWeek).where(CloseOrderWeek.week_start == week_start))
    if week is None:
        _post_once(
            db,
            f"alert:no-draft:{today.isoformat()}",
            f"🔴 Chưa có bản nháp Close order 9:00 hôm nay ({dm(today)}). "
            "Máy công ty có chạy lịch DayTienDo-CloseOrderNhap không?",
            now,
        )
        return "no draft"
    if week.is_published:
        return "already published"
    text = checklist_text(db, week_start, today, reminder=True)
    if text:
        post(db, text)
        return "reminded"
    return "complete"


def cron_publish_check(db: Session, now: datetime) -> str:
    """~16:00 Thursday: was the week published at 15:00?"""
    today = now.date()
    if today.weekday() != 3:
        return "not thursday"
    week_start = previous_week_start(today)
    week = db.scalar(select(CloseOrderWeek).where(CloseOrderWeek.week_start == week_start))
    if week is not None and week.is_published:
        return "ok"
    _, end = week_bounds(week_start)
    _post_once(
        db,
        f"alert:no-publish:{today.isoformat()}",
        f"🔴 Close order tuần {dm(week_start)}–{dm(end)} chưa được công bố lúc 15:00. "
        "Chạy ChayCloseOrder.bat trên máy công ty.",
        now,
    )
    return "alerted"


def run_safely(job, db: Session, *args) -> None:
    """Zalo messages after an upload must never fail the upload itself."""
    try:
        job(db, *args)
        db.commit()
    except Exception:
        db.rollback()
        log.exception("zalo alert %s failed", getattr(job, "__name__", job))
