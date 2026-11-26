"""Đặt tem (label ordering) - status pushed from Duy's PC, announced by the Zalo bot.

Duy's "Sổ theo dõi đặt tem" tool (outside this repo) reads the weekly THV
PRODUCTION PLAN, every "bảng tiến độ" and the warehouse's label-printing system
(IN TEM NỘI BỘ), then pushes here each morning / when a new plan arrives / after
it ordered labels by itself. One order here = JO + colour + line, the unit one
label request (SRN) is made for. Labels must be ordered 5 days before Start sew
(the warehouse prints 2 days after the request).

Nothing is stored in new tables: the latest push is kept as JSON in zalo_state
(labels:summary / labels:due / labels:orders), like the bot's other notes.

The bot posts:
- once a working day, the orders whose label deadline is past / today / within
  3 days and still not ordered, grouped by the person keeping the order;
- every push that reports SRNs the tool just ordered by itself."""

import json
from collections import defaultdict
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.services.close_order import holiday_set
from app.services.zalo_alerts import dm, is_working_day, post, short_line, state_get, state_set

KEY_SUMMARY = "labels:summary"
KEY_DUE = "labels:due"
KEY_ORDERS = "labels:orders"
PER_OWNER_LIMIT = 8
NO_OWNER = "Chưa rõ người phụ trách"
LEVEL_ORDER = {"QUÁ HẠN": 0, "HÔM NAY": 1, "SẮP HẠN": 2}


def _load(db: Session, key: str, default):
    raw = state_get(db, key)
    if not raw:
        return default
    try:
        return json.loads(raw)
    except ValueError:
        return default


def _day(value) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10]) if value else None
    except ValueError:
        return None


def ingest(db: Session, payload, now: datetime) -> dict:
    state_set(db, KEY_SUMMARY, json.dumps(payload.summary, ensure_ascii=False), now)
    state_set(db, KEY_DUE, json.dumps(payload.due, ensure_ascii=False), now)
    state_set(db, KEY_ORDERS, json.dumps(payload.orders, ensure_ascii=False), now)
    state_set(db, "labels:received", now.isoformat(timespec="minutes"), now)
    return {"orders": len(payload.orders), "due": len(payload.due), "new_srn": len(payload.new_srn)}


# ----------------------------------------------------------------- texts

def _order_label(o: dict) -> str:
    return f"L{short_line(str(o.get('line') or '?'))} {o.get('jo', '?')} {o.get('color', '')}".strip()


def _due_bullet(o: dict) -> str:
    days = o.get("con_ngay")
    level = o.get("muc") or ""
    if level == "QUÁ HẠN" and isinstance(days, int):
        when = f"quá hạn {-days} ngày"
    elif level == "HÔM NAY":
        when = "hạn hôm nay"
    elif isinstance(days, int):
        when = f"còn {days} ngày"
    else:
        when = level.lower()
    start = _day(o.get("start_sew"))
    extra = f", Start sew {dm(start)}" if start else ""
    return f"• {_order_label(o)} – {when}{extra}"


def due_text(due: list[dict], today: date) -> str | None:
    if not due:
        return None
    count = {k: sum(1 for o in due if o.get("muc") == k) for k in LEVEL_ORDER}
    head = [
        f"🏷️ Đặt tem hôm nay ({dm(today)}): {len(due)} đơn cần đặt (JO + màu + line)",
        f"🔴 Quá hạn {count['QUÁ HẠN']} • 🟠 Hạn hôm nay {count['HÔM NAY']} • 🟡 Sắp hạn {count['SẮP HẠN']}",
    ]
    by_owner: dict[str, list[dict]] = defaultdict(list)
    for o in due:
        by_owner[o.get("nguoi_phu_trach") or NO_OWNER].append(o)
    blocks = []
    for owner, items in sorted(by_owner.items(), key=lambda kv: (kv[0] == NO_OWNER, -len(kv[1]), kv[0])):
        items.sort(key=lambda o: (LEVEL_ORDER.get(o.get("muc"), 9), o.get("con_ngay") or 0))
        title = f"{owner} ơi ({len(items)}):" if owner != NO_OWNER else f"{NO_OWNER} ({len(items)}):"
        lines = [title] + [_due_bullet(o) for o in items[:PER_OWNER_LIMIT]]
        if len(items) > PER_OWNER_LIMIT:
            lines.append(f"… và {len(items) - PER_OWNER_LIMIT} đơn nữa")
        blocks.append("\n".join(lines))
    tail = "Tag bot: \"tem <JO>\" để xem đơn đã đặt chưa."
    return "\n".join(head) + "\n\n" + "\n\n".join(blocks) + "\n\n" + tail


def new_srn_text(new_srn: list[dict]) -> str | None:
    if not new_srn:
        return None
    lines = [f"✅ Đã tự đặt {len(new_srn)} SRN in tem (kho in sau 2 ngày):"]
    for s in new_srn[:30]:
        rows = f", {s['so_dong']} dòng" if s.get("so_dong") else ""
        lines.append(f"• {_order_label(s)} → {s.get('request_code', '?')}{rows}")
    if len(new_srn) > 30:
        lines.append(f"… và {len(new_srn) - 30} SRN nữa")
    return "\n".join(lines)


# ------------------------------------------------------------- triggers

def after_label_ingest(db: Session, now: datetime, new_srn: list[dict]) -> None:
    text = new_srn_text(new_srn)
    if text:
        post(db, text)
    today = now.date()
    key = f"labels:due:{today.isoformat()}"
    if is_working_day(today, holiday_set(db)) and state_get(db, key) is None:
        text = due_text(_load(db, KEY_DUE, []), today)
        if text:
            post(db, text)
        state_set(db, key, "sent" if text else "none", now)


# -------------------------------------------------------------- answers

def answer(db: Session, term: str | None, today: date) -> str:
    summary = _load(db, KEY_SUMMARY, {})
    if not summary:
        return "Chưa có dữ liệu đặt tem trên web."
    if not term:
        due = _load(db, KEY_DUE, [])
        counts = summary.get("theo_trang_thai") or {}
        when = summary.get("cap_nhat_luc", "?")
        lines = [
            f"🏷️ Đặt tem (cập nhật {when}, {summary.get('plan', '')}):",
            f"• Tổng {summary.get('tong_don', 0)} đơn: " + ", ".join(f"{k.lower()} {v}" for k, v in counts.items()),
        ]
        if due:
            lines.append("")
            lines.append(due_text(due, today) or "")
        else:
            lines.append("• Không có đơn nào đến hạn đặt tem trong 3 ngày tới.")
        return "\n".join(lines).strip()
    t = term.upper().replace(" ", "")
    found = [o for o in _load(db, KEY_ORDERS, []) if t in str(o.get("jo", "")).upper()]
    if not found:
        return f"Không thấy JO \"{term}\" trong sổ đặt tem (chỉ có đơn ở line số trong plan tuần)."
    out = []
    for o in sorted(found, key=lambda x: (x.get("jo", ""), x.get("color", ""), x.get("line", "")))[:20]:
        status = o.get("trang_thai") or "?"
        if status.startswith("ĐÃ ĐẶT") or status.startswith("CHUNG"):
            day = _day(o.get("ngay_dat"))
            srn = f" · {o['ma_srn']}" + (f" ({o['tt_srn']})" if o.get("tt_srn") else "") if o.get("ma_srn") else ""
            detail = f"{status}" + (f" {dm(day)}" if day else "") + srn
        else:
            han = _day(o.get("han_dat"))
            detail = f"{status} – hạn đặt {dm(han)}" if han else status
        owner = f" ({o['nguoi_phu_trach']})" if o.get("nguoi_phu_trach") else ""
        out.append(f"• {_order_label(o)}{owner}: {detail}")
        if o.get("can_xem"):
            out.append(f"  ⚠️ {o['can_xem'][:150]}")
    if len(found) > 20:
        out.append(f"… và {len(found) - 20} dòng nữa")
    return "\n".join(out)
