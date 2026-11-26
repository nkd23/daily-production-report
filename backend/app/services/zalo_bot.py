"""The Zalo bot's replies, in the factory's group chat.

The bot works in one group: someone types "dangky <code>" there
(ZALO_GROUP_CODE) to make it the bot's group. Zalo only passes on group
messages that @mention the bot or reply to it. Everyone in the group sees
what the Managers see on the web: published Close order weeks, without
Finishing's hand edits or removed orders. Private chats get no data.

Commands (accents and case don't matter):
  hd                      what the bot can do
  <JO>  e.g. 4813ES01     where the order is: Close order week, late, Tiến độ
  line 28                 that line's sewn, not packed-out orders
  sắp late                orders about to go late (and already late)
  late                    late orders of the latest Close order week
  tuần                    the latest Close order week in numbers"""

import re
import secrets
from collections import Counter, defaultdict
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import CloseOrderItem, CloseOrderWeek, ProgressOrder
from app.services.close_order import _line_map, holiday_set, item_out, week_bounds
from app.services.labels import answer as label_answer
from app.services.zalo_alerts import (
    GROUP_KEY,
    close_order_link,
    fold,
    dm,
    group_chat_id,
    open_close_orders,
    person_name,
    risk_text,
    short_line,
    state_get,
    state_set,
)

MAX_REGISTER_FAILURES = 5
_JO_RE = re.compile(r"^[A-Z0-9]*\d[A-Z0-9]*$")


def strip_mention(text: str) -> str:
    """"@Close Order THV sắp late" -> "sắp late"."""
    text = " ".join((text or "").split())
    if not text.startswith("@"):
        return text
    name = get_settings().zalo_bot_name.strip()
    if name and fold(text[1:]).startswith(fold(name)):
        # fold() keeps the length of plain letters, so cut by the name's words.
        return " ".join(text[1:].split(" ")[len(name.split()):]).strip()
    return text.split(" ", 1)[1] if " " in text else ""


# --------------------------------------------------------- group register

def _register(db: Session, chat_id: str, code: str, now: datetime) -> str:
    expected = get_settings().zalo_group_code
    fail_key = f"regfail:{chat_id}"
    count, _, since = (state_get(db, fail_key) or "").partition("|")
    try:
        recent = datetime.fromisoformat(since) > now - timedelta(hours=1)
    except ValueError:
        recent = False
    if recent and int(count or 0) >= MAX_REGISTER_FAILURES:
        return "Sai mã quá nhiều lần, thử lại sau 1 tiếng."
    if not expected or not secrets.compare_digest(code, expected):
        state_set(db, fail_key, f"{int(count or 0) + 1 if recent else 1}|{since if recent else now.isoformat()}", now)
        return "Mã đăng ký không đúng."
    state_set(db, fail_key, None, now)
    state_set(db, GROUP_KEY, chat_id, now)
    return "✅ Đã đăng ký nhóm này. Từ giờ bot gửi cảnh báo Close order vào đây.\n\n" + help_text()


# ----------------------------------------------------------------- answers

def help_text() -> str:
    return "\n".join(
        [
            "Bot Close order – tag bot rồi nhắn:",
            "• Mã JO (vd 4813ES01): đơn đang ở đâu, late chưa",
            "• line 28: các đơn đã End Sew, chưa End pack của line",
            "• sắp late: đơn sắp late và đã late, theo người phụ trách",
            "• late: các đơn late tuần Close order gần nhất",
            "• tuần: tóm tắt tuần Close order gần nhất",
            "• tem: đơn cần đặt tem hôm nay · tem <JO>: đơn đó đã đặt tem chưa",
            "Bot tự nhắn: cảnh báo sắp late sau 9:00 mỗi ngày, bản nháp Close order 9:00 thứ 5.",
        ]
    )


def _latest_week(db: Session) -> CloseOrderWeek | None:
    return db.scalar(
        select(CloseOrderWeek)
        .where(CloseOrderWeek.is_published == True)  # noqa: E712
        .order_by(CloseOrderWeek.week_start.desc())
        .limit(1)
    )


def _week_label(week: CloseOrderWeek) -> str:
    _, end = week_bounds(week.week_start)
    return f"tuần {dm(week.week_start)}–{dm(end)}"


def _items(db: Session, week_start, today) -> list[dict]:
    lines = _line_map(db)
    holidays = holiday_set(db)
    return [
        item_out(i, lines, today, holidays, reveal_edits=False)
        for i in db.scalars(select(CloseOrderItem).where(CloseOrderItem.week_start == week_start)).all()
        if not i.is_removed
    ]


def _date_text(value) -> str:
    if value is None:
        return "chưa End pack"
    if hasattr(value, "day"):
        return dm(value)
    try:
        return dm(datetime.fromisoformat(value).date())
    except ValueError:
        return str(value)


def week_summary(db: Session, today) -> str:
    week = _latest_week(db)
    if week is None:
        return "Chưa có tuần Close order nào."
    items = _items(db, week.week_start, today)
    late = [i for i in items if i["is_late"]]
    total = len(items)
    ontime_pct = round(100 * (total - len(late)) / total) if total else 0
    parts = [f"📊 Close order {_week_label(week)}", f"{total} JO · {len(late)} late · ontime {ontime_pct}%"]
    if late:
        by_dept = Counter(i["department"] or "Chưa phân" for i in late)
        parts.append("Late theo bộ phận: " + ", ".join(f"{d} {n}" for d, n in by_dept.most_common()))
        by_line = Counter(f"L{short_line(i['line_number'])}" for i in late)
        parts.append("Line late nhiều nhất: " + ", ".join(f"{ln} ({n})" for ln, n in by_line.most_common(3)))
    unpacked = sum(1 for i in items if not i["end_pack"])
    if unpacked:
        parts.append(f"Chưa End pack: {unpacked} JO")
    link = close_order_link()
    if link:
        parts.append(f"👉 {link}")
    return "\n".join(parts)


def late_list(db: Session, today) -> str:
    week = _latest_week(db)
    if week is None:
        return "Chưa có tuần Close order nào."
    late = [i for i in _items(db, week.week_start, today) if i["is_late"]]
    if not late:
        return f"✅ Close order {_week_label(week)}: không có đơn late."
    late.sort(key=lambda i: (-(i["late_duration"] or 0), i["line_number"]))
    parts = [f"⚫ Đơn late – Close order {_week_label(week)} ({len(late)}):"]
    for i in late[:25]:
        dept = f" · {i['department']}" if i["department"] else ""
        parts.append(f"• L{short_line(i['line_number'])} {i['jo']} – {i['late_duration']} ngày{dept}")
        if i["remark"]:
            parts.append(f"   {i['remark'][:120]}")
    if len(late) > 25:
        parts.append(f"… và {len(late) - 25} đơn nữa – xem trên web.")
    return "\n".join(parts)


def risk_answer(db: Session, today) -> str:
    return risk_text(open_close_orders(db, today), today, full=True) or "✅ Không có đơn nào sắp late hay đã late mà chưa End pack."


def line_answer(db: Session, number: int, today) -> str:
    line_number = f"{number:02d}AB"
    orders = [o for o in open_close_orders(db, today) if o["line_number"] == line_number]
    rows = db.scalars(select(ProgressOrder).where(ProgressOrder.line_number == line_number)).all()
    owners = sorted({person_name(r.source_file) for r in rows})
    sewing = len({r.jo.strip().upper() for r in rows if not r.end_sew})
    head = f"🧵 Line {number:02d} – {dm(today)}"
    if owners:
        head += f" (bảng tiến độ của {', '.join(owners)})"
    parts = [head]
    if orders:
        parts.append(f"Đã End Sew, chưa End pack ({len(orders)}):")
        for o in orders[:20]:
            if o["days_left"] <= 0:
                state = f"late {o['duration']} ngày"
            elif o["days_left"] == 1:
                state = "phải pack hôm nay"
            else:
                state = f"còn {o['days_left']} ngày"
            parts.append(f"• {o['jo']} – End Sew {dm(o['end_sew'])} – Pack-Cut {o['pack_cut']:,} – {state}")
    elif rows:
        parts.append("Không có đơn nào đã End Sew mà chưa End pack.")
    else:
        parts.append("Không có đơn nào của line này trong bảng tiến độ hôm nay.")
    if sewing:
        parts.append(f"Đang may: {sewing} JO chưa End Sew.")
    return "\n".join(parts)


def jo_answer(db: Session, term: str, today) -> str:
    published = set(db.scalars(select(CloseOrderWeek.week_start).where(CloseOrderWeek.is_published == True)).all())  # noqa: E712
    items = [
        i
        for i in db.scalars(select(CloseOrderItem).where(func.upper(CloseOrderItem.jo).like(f"%{term}%"))).all()
        if i.week_start in published and not i.is_removed
    ]
    running = db.scalars(select(ProgressOrder).where(func.upper(ProgressOrder.jo).like(f"%{term}%"))).all()
    keys = sorted({(i.line_number, i.jo.upper()) for i in items} | {(r.line_number, r.jo.strip().upper()) for r in running})
    if not keys:
        return f"Không tìm thấy JO nào có \"{term}\" (trong Close order 6 tuần gần nhất và Tiến độ hôm nay)."
    if len(keys) > 6:
        names = ", ".join(sorted({jo for _, jo in keys})[:15])
        return f"Có {len(keys)} đơn khớp \"{term}\". Gõ cụ thể hơn, ví dụ: {names}"

    lines = _line_map(db)
    holidays = holiday_set(db)
    weeks = {w.week_start: w for w in db.scalars(select(CloseOrderWeek)).all()}
    open_orders = {(o["line_number"], o["jo"].upper()): o for o in open_close_orders(db, today)}
    by_key_items = defaultdict(list)
    for i in items:
        by_key_items[(i.line_number, i.jo.upper())].append(i)
    by_key_rows = defaultdict(list)
    for r in running:
        by_key_rows[(r.line_number, r.jo.strip().upper())].append(r)

    blocks = []
    for key in keys:
        line_number, jo = key
        rows = by_key_rows.get(key, [])
        its = sorted(by_key_items.get(key, []), key=lambda i: i.week_start)
        buyer = next((x.buyer for x in [*its, *rows] if x.buyer), None)
        head = f"📦 {jo} – L{short_line(line_number)}" + (f" – {buyer}" if buyer else "")
        if rows:
            head += f"\nPhụ trách: {', '.join(sorted({person_name(r.source_file) for r in rows}))}"
        block = [head]
        for it in its[-2:]:
            out = item_out(it, lines, today, holidays, reveal_edits=False)
            week = weeks.get(it.week_start)
            label = _week_label(week) if week else dm(it.week_start)
            status = "LATE" if out["is_late"] else "ontime"
            block.append(
                f"Close order {label}: End Sew {dm(out['end_sew'])} · End pack {_date_text(out['end_pack'])} · "
                f"Late duration {out['late_duration'] if out['late_duration'] is not None else '-'} → {status}"
            )
            extra = []
            if out["department"]:
                extra.append(f"Bộ phận: {out['department']}")
            if out["remark"]:
                extra.append(f"Remark: {out['remark'][:200]}")
            if extra:
                block.append("   " + " · ".join(extra))
        if rows:
            unsewn = sum(1 for r in rows if not r.end_sew)
            pack_cut = sum(r.pack_cut or 0 for r in rows)
            state = f"Tiến độ hôm nay: {len(rows)} màu chưa End pack, Pack-Cut {pack_cut:,}"
            if unsewn:
                state += f", {unsewn} màu chưa End Sew"
            o = open_orders.get(key)
            if o is not None:
                if o["days_left"] <= 0:
                    state += f" – đã late {o['duration']} ngày"
                elif o["days_left"] == 1:
                    state += " – phải End pack hôm nay"
                else:
                    state += f" – còn {o['days_left']} ngày trước khi late"
            block.append(state)
        elif not its:
            block.append("Không còn trong Tiến độ.")
        blocks.append("\n".join(block))
    return "\n\n".join(blocks)


# ---------------------------------------------------------------- dispatch

def handle_text(db: Session, chat_id: str, chat_type: str, text: str, now: datetime) -> str | None:
    """The reply to one message, or None to stay silent."""
    raw = strip_mention(text)
    folded = fold(raw)

    register = re.fullmatch(r"dang ?ky\s+(\S+)", folded)
    if chat_type != "GROUP":
        return "Bot chỉ trả lời trong nhóm chat của xưởng. Bạn hãy tag bot trong nhóm nhé."
    if register:
        return _register(db, chat_id, raw.split()[-1], now)
    if chat_id != group_chat_id(db):
        return None  # a group nobody registered: say nothing

    today = now.date()
    if folded in ("", "hd", "help", "menu", "?", "huong dan", "hi", "hello", "xin chao", "chao"):
        return help_text()
    if folded in ("sap late", "nguy co", "sap tre", "canh bao"):
        return risk_answer(db, today)
    if folded in ("late", "tre", "don late"):
        return late_list(db, today)
    if folded in ("tuan", "tom tat", "close", "close order", "tong hop", "bao cao"):
        return week_summary(db, today)
    m = re.fullmatch(r"(?:dat )?tem(?:\s+(\S+))?", folded)
    if m:
        return label_answer(db, raw.split()[-1] if m.group(1) else None, today)
    m = re.fullmatch(r"(?:line|chuyen|l)\s*0*(\d{1,3})(?:\s*ab)?", folded)
    if m:
        return line_answer(db, int(m.group(1)), today)
    term = raw.upper().replace(" ", "")
    if len(term) >= 4 and _JO_RE.match(term) and any(c.isalpha() for c in term):
        return jo_answer(db, term, today)
    return "Mình chưa hiểu. Tag bot và nhắn \"hd\" để xem bot làm được gì."
