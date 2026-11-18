"""Đẩy bảng tiến độ lên web - chạy trên máy văn phòng lúc 9:00 mỗi sáng.

Đọc mọi file "bảng tiến độ" (.xlsx/.xlsm) trong thư mục SharePoint đã đồng
bộ về máy bằng OneDrive, giữ các dòng có Pack-cut khác 0 hoặc đã có Cut mà
chưa có Sew, tra WF và Cust. Style No trong file THV PRODUCTION PLAN mới nhất, rồi gửi lên web
(POST /api/progress/ingest). Cài đặt nằm trong config.ini cạnh file .exe.

    DayTienDo.exe                  chạy bình thường (đọc + gửi tab Tiến độ)
    DayTienDo.exe --close-order    gửi số Close order và công bố tuần trước cho
                                   mọi người (chạy 15:00 thứ 5 hằng tuần)
    DayTienDo.exe --close-order --nhap
                                   bản nháp chỉ Finishing xem (9:00 thứ 5)
    thêm --thu                     chỉ đọc, ghi kết quả ra file .json, không gửi

Chỉ đọc file - không bao giờ sửa file Excel của ai."""

import configparser
import json
import os
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import warnings
from datetime import date, datetime, timedelta

import openpyxl

VERSION = "1.3"
TRACKER_SHEET = "bảng tiến độ"
PLAN_SHEET = "Plan"

# Tracker header (normalised, see _norm) -> payload field. The first 15
# columns are the same in every tracker; the rest move around, so every
# column is matched by name, never by position.
HEADER_FIELDS = {
    "line": "line",
    "byr": "buyer",
    "jo": "jo",
    "bpo date": "bpo_date",
    "shipment plan": "shipment_plan",
    "order carton": "order_carton",
    "start sew": "start_sew",
    "end sew": "end_sew",
    "end pack": "end_pack",
    "order qty": "order_qty",
    "allocate qty": "allocate_qty",
    "cut qty": "cut_qty",
    "sew qty": "sew_qty",
    "pack qty": "pack_qty",
    "pack-cut": "pack_cut",
}
COLOR_HEADERS = {"color", "màu", "mau"}
CUST_STYLE_HEADERS = {"cust style no", "cust. style no", "cust.style no"}
DATE_FIELDS = {"bpo_date", "shipment_plan", "order_carton", "start_sew", "end_sew", "end_pack"}
NUMBER_FIELDS = {"order_qty", "allocate_qty", "cut_qty", "sew_qty", "pack_qty", "pack_cut"}
# Close order: every colour row of a JO whose End sew falls in this many
# recent days is sent (the web needs all colours to tell whether the whole
# JO is sewn); older JOs closed long ago are left out.
CLOSE_ORDER_DAYS = 120
CLOSE_ORDER_FIELDS = (
    "line", "buyer", "jo", "bpo_date", "shipment_plan", "end_sew", "end_pack",
    "order_qty", "cut_qty", "sew_qty", "pack_qty", "pack_cut",
)


def base_dir() -> str:
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


LOG_PATH = os.path.join(base_dir(), "DayTienDo.log")


def log(msg: str) -> None:
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S}  {msg}"
    # The .exe is built without a console window (so nothing pops up on the
    # office PC at 9:00) - then there is no stdout and the log file is all.
    if sys.stdout is not None:
        try:
            print(line)
        except UnicodeEncodeError:
            print(line.encode("ascii", "replace").decode())
    try:
        if os.path.exists(LOG_PATH) and os.path.getsize(LOG_PATH) > 1_000_000:
            with open(LOG_PATH, encoding="utf-8", errors="replace") as f:
                tail = f.read()[-200_000:]
            with open(LOG_PATH, "w", encoding="utf-8") as f:
                f.write(tail)
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def _norm(header) -> str:
    if header is None:
        return ""
    text = unicodedata.normalize("NFC", str(header)).strip().lower()
    text = " ".join(text.split())
    return text.replace(" - ", "-").replace("- ", "-").replace(" -", "-")


def _date_text(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    return text or None


def _number(value):
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    try:
        return float(str(value).replace(",", "").strip())
    except ValueError:
        return None


def _text(value):
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if isinstance(value, datetime):
        return value.date().isoformat()
    text = str(value).strip()
    return text or None


def read_plan(folder: str):
    """Latest THV PRODUCTION PLAN file: JO -> (product category, cust style)."""
    candidates = [
        os.path.join(folder, f)
        for f in os.listdir(folder)
        if "production plan" in f.lower() and f.lower().endswith((".xlsx", ".xlsm")) and not f.startswith("~$")
    ]
    if not candidates:
        return None, None, {}, "Không thấy file PRODUCTION PLAN"
    path = max(candidates, key=os.path.getmtime)
    modified = datetime.fromtimestamp(os.path.getmtime(path)).isoformat(timespec="seconds")
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        try:
            ws = wb[PLAN_SHEET] if PLAN_SHEET in wb.sheetnames else wb.worksheets[0]
            rows = ws.iter_rows(values_only=True)
            header = [_norm(h) for h in next(rows)]
            jo_i = header.index("jo no")
            cat_i = header.index("product category") if "product category" in header else None
            cust_i = header.index("cust. style no") if "cust. style no" in header else None
            lookup = {}
            for r in rows:
                if jo_i >= len(r) or r[jo_i] is None:
                    continue
                jo = str(r[jo_i]).strip().upper()
                if jo in lookup:  # like XLOOKUP: the first match wins
                    continue
                cat = _text(r[cat_i]) if cat_i is not None and cat_i < len(r) else None
                cust = _text(r[cust_i]) if cust_i is not None and cust_i < len(r) else None
                lookup[jo] = (cat, cust)
        finally:
            wb.close()
        return os.path.basename(path), modified, lookup, None
    except Exception as exc:  # noqa: BLE001 - report it, keep going without the plan
        return os.path.basename(path), modified, {}, f"{type(exc).__name__}: {exc}"


def _find_sheet(wb):
    for ws in wb.worksheets:
        if _norm(ws.title) == TRACKER_SHEET:
            return ws
    for ws in wb.worksheets:
        try:
            header = {_norm(h) for h in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))}
        except StopIteration:
            continue
        if "jo" in header and "pack-cut" in header:
            return ws
    raise ValueError(f'Không thấy sheet "{TRACKER_SHEET}"')


def read_tracker(path: str, plan: dict, close_order: bool = False) -> list[dict]:
    """Rows for the Tiến độ tab (running orders), or with close_order=True
    every row with a JO, reduced to what the Close order tab needs."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        ws = _find_sheet(wb)
        rows = ws.iter_rows(values_only=True)
        header = [_norm(h) for h in next(rows)]
        cols = {}
        for i, h in enumerate(header):
            field = HEADER_FIELDS.get(h)
            if field and field not in cols:
                cols[field] = i
        missing = [h for h in ("line", "jo", "pack-cut") if HEADER_FIELDS[h] not in cols]
        if missing:
            raise ValueError("Thiếu cột: " + ", ".join(missing))
        color_cols = [i for i, h in enumerate(header) if h in COLOR_HEADERS]
        cust_cols = [i for i, h in enumerate(header) if h in CUST_STYLE_HEADERS]

        out = []
        for r in rows:
            def cell(i):
                return r[i] if i < len(r) else None

            jo = _text(cell(cols["jo"]))
            if not jo:
                continue
            color = next((c for c in (_text(cell(i)) for i in color_cols) if c), None)
            if close_order:
                item = {}
                for field in CLOSE_ORDER_FIELDS:
                    i = cols.get(field)
                    value = cell(i) if i is not None else None
                    if field in DATE_FIELDS:
                        item[field] = _date_text(value)
                    elif field in NUMBER_FIELDS:
                        item[field] = _number(value)
                    else:
                        item[field] = _text(value)
                item["color"] = color
                # WF & TAP orders are the WWF_T product category.
                item["product_category"] = plan.get(jo.upper(), (None, None))[0]
                out.append(item)
                continue
            pack_cut = _number(cell(cols["pack_cut"]))
            cut = _number(cell(cols["cut_qty"])) if "cut_qty" in cols else None
            sew = _number(cell(cols["sew_qty"])) if "sew_qty" in cols else None
            # Same rule as is_running_order on the web: Pack-cut khác 0, or
            # cut has started but nothing is sewn yet.
            if not pack_cut and not (cut and cut > 0 and not sew):
                continue
            item = {}
            for field, i in cols.items():
                value = cell(i)
                if field in DATE_FIELDS:
                    item[field] = _date_text(value)
                elif field in NUMBER_FIELDS:
                    item[field] = _number(value)
                else:
                    item[field] = _text(value)
            # Some trackers have two colour columns with only one filled in.
            item["color"] = color
            cat, cust = plan.get(jo.upper(), (None, None))
            tracker_cust = next((c for c in (_text(cell(i)) for i in cust_cols) if c), None)
            item["product_category"] = cat
            item["cust_style_no"] = cust or tracker_cust
            out.append(item)
        return out
    finally:
        wb.close()


def _recent_close_order_jos(sources: list[dict]) -> set[str]:
    cutoff = (date.today() - timedelta(days=CLOSE_ORDER_DAYS)).isoformat()
    return {
        r["jo"].upper()
        for s in sources
        for r in s["rows"]
        if r.get("end_sew") and len(r["end_sew"]) == 10 and r["end_sew"] >= cutoff
    }


def collect(folder: str, plan_folder: str, close_order: bool = False) -> dict:
    plan_file, plan_modified, plan, plan_error = read_plan(plan_folder)
    if plan_error:
        log(f"PLAN: {plan_error}")
    else:
        log(f"PLAN: {plan_file} ({len(plan)} JO)")

    sources = []
    for name in sorted(os.listdir(folder)):
        path = os.path.join(folder, name)
        if (
            not os.path.isfile(path)
            or name.startswith("~$")
            or not name.lower().endswith((".xlsx", ".xlsm"))
            or "production plan" in name.lower()
        ):
            continue
        modified = datetime.fromtimestamp(os.path.getmtime(path)).isoformat(timespec="seconds")
        source = {"file_name": name, "modified_at": modified, "error": None, "rows": []}
        try:
            source["rows"] = read_tracker(path, plan, close_order)
            if not close_order:
                log(f"  {name}: {len(source['rows'])} đơn")
        except Exception as exc:  # noqa: BLE001 - one broken file must not stop the rest
            source["error"] = f"{type(exc).__name__}: {exc}"
            log(f"  {name}: LỖI {source['error']}")
        sources.append(source)

    if close_order:
        # Kept across all files: a JO's colours may sit in different trackers.
        recent = _recent_close_order_jos(sources)
        for source in sources:
            source["rows"] = [r for r in source["rows"] if r["jo"].upper() in recent]
            if not source["error"]:
                log(f"  {source['file_name']}: {len(source['rows'])} dòng")
        return {"agent_version": VERSION, "sources": sources}

    return {
        "agent_version": VERSION,
        "plan_file": plan_file,
        "plan_modified_at": plan_modified,
        "plan_error": plan_error,
        "plan_jo_count": len(plan),
        "sources": sources,
    }


def send(api: str, key: str, payload: dict, path: str = "/api/progress/ingest") -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    url = api.rstrip("/") + path
    last_error = None
    for attempt in range(1, 4):
        req = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={"Content-Type": "application/json", "X-Progress-Key": key, "User-Agent": f"DayTienDo/{VERSION}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300]
            if exc.code in (400, 401, 403, 422, 503):
                raise RuntimeError(f"Web từ chối (HTTP {exc.code}): {detail}") from exc
            last_error = f"HTTP {exc.code}: {detail}"
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = str(exc)
        log(f"Gửi lần {attempt} lỗi: {last_error}")
        time.sleep(20 * attempt)
    raise RuntimeError(f"Không gửi được lên web: {last_error}")


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    warnings.filterwarnings("ignore")
    dry_run = "--thu" in sys.argv[1:]
    close_order = "--close-order" in sys.argv[1:]
    draft = "--nhap" in sys.argv[1:]
    cfg_path = os.path.join(base_dir(), "config.ini")
    cfg = configparser.ConfigParser()
    if not cfg.read(cfg_path, encoding="utf-8") or "tien_do" not in cfg:
        log(f"Không đọc được {cfg_path} (cần mục [tien_do])")
        return 2
    c = cfg["tien_do"]
    folder = os.path.expandvars(c.get("thu_muc", "").strip().strip('"'))
    plan_folder = os.path.expandvars(c.get("thu_muc_plan", "").strip().strip('"')) or folder
    api = c.get("api", "").strip()
    key = c.get("khoa", "").strip()
    if not os.path.isdir(folder):
        log(f"Không thấy thư mục bảng tiến độ: {folder}")
        return 2
    if not os.path.isdir(plan_folder):
        log(f"Không thấy thư mục PRODUCTION PLAN: {plan_folder}")
        return 2

    log(f"Bắt đầu đọc {folder}" + ((" (Close order - bản nháp)" if draft else " (Close order)") if close_order else ""))
    payload = collect(folder, plan_folder, close_order)
    if close_order:
        # Thursday 9:00: draft only Finishing sees; 15:00: publish to all.
        payload["publish"] = not draft
    total = sum(len(s["rows"]) for s in payload["sources"])
    errors = sum(1 for s in payload["sources"] if s["error"])
    log(f"Đọc xong {len(payload['sources'])} file, {total} {'dòng' if close_order else 'đơn'}, {errors} file lỗi")

    if dry_run:
        out = os.path.join(base_dir(), "thu_nghiem_close_order.json" if close_order else "thu_nghiem.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)
        log(f"Chạy thử: đã ghi {out}, không gửi lên web")
        return 0
    if not payload["sources"]:
        log("Không có file nào để gửi")
        return 1
    if not api or not key:
        log("config.ini thiếu api hoặc khoa")
        return 2
    try:
        result = send(api, key, payload, "/api/close-order/ingest" if close_order else "/api/progress/ingest")
    except RuntimeError as exc:
        log(str(exc))
        return 1
    log(f"Đã gửi lên web: {result}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
