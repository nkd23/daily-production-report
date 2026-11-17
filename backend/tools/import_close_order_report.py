"""One-off: load the weeks of the old Excel "Close Order Report" into the
web's Close order history, through POST /api/close-order/import.

Each week sheet ("08.31-09.05", "11.02-11.07"...) becomes one week as it
was in the file, including WF & TAP, Remark and Department in charge.
The summary block to the right of the table is ignored.

    python tools/import_close_order_report.py "Close Order Report -11.xlsx" \
        --api http://localhost:8000 --key <PROGRESS_INGEST_KEY> [--dry-run]

The key can also come from the PROGRESS_INGEST_KEY environment variable.
"""

import argparse
import json
import os
import re
import sys
import urllib.request
import warnings
from datetime import date, datetime, timedelta

import openpyxl

SHEET_RE = re.compile(r"^(\d{2})\.(\d{2})-(\d{2})\.(\d{2})$")
COLUMNS = {
    "line": "line",
    "byr": "buyer",
    "jo": "jo",
    "order qty": "order_qty",
    "bpo date": "bpo_date",
    "exfty date": "exfty_date",
    "cut qty": "cut_qty",
    "sew qty": "sew_qty",
    "pack qty": "pack_qty",
    "pack-cut": "pack_cut",
    "end sew date": "end_sew",
    "end pack date": "end_pack",
    "wf& tap 3 day": "wf",
    "remark": "remark",
    "department in charge": "department",
}


def norm(h) -> str:
    return " ".join(str(h or "").replace("\n", " ").split()).strip().lower()


def as_text(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    return text or None


def as_number(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value
    return None


def read_weeks(path: str) -> list[dict]:
    wb = openpyxl.load_workbook(path, data_only=True)
    weeks = []
    for ws in wb.worksheets:
        m = SHEET_RE.match(ws.title.strip())
        if not m:
            continue
        rows = ws.iter_rows(values_only=True)
        header = [norm(h) for h in next(rows)]
        cols = {}
        for i, h in enumerate(header):
            field = COLUMNS.get(h)
            if field and field not in cols:  # the summary block repeats "Executive" further right
                cols[field] = i
        items = []
        for r in rows:
            jo = as_text(r[cols["jo"]]) if cols["jo"] < len(r) else None
            if not jo:
                continue
            item = {}
            for field, i in cols.items():
                v = r[i] if i < len(r) else None
                if field in ("order_qty", "cut_qty", "sew_qty", "pack_qty", "pack_cut"):
                    item[field] = as_number(v)
                elif field == "wf":
                    item[field] = bool(as_text(v))
                else:
                    item[field] = as_text(v)
            items.append(item)
        sews = sorted(i["end_sew"] for i in items if i.get("end_sew") and len(i["end_sew"]) == 10)
        if not sews:
            print(f"  bỏ qua {ws.title}: không có End Sew", file=sys.stderr)
            continue
        # The sheet name has no year: take it from the week's End Sew dates.
        year = int(sews[len(sews) // 2][:4])
        start = date(year, int(m.group(1)), int(m.group(2)))
        start -= timedelta(days=start.weekday())
        weeks.append({"week_start": start.isoformat(), "items": items})
        print(f"  {ws.title} -> tuần {start:%d/%m/%Y}: {len(items)} đơn")
    return weeks


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    warnings.filterwarnings("ignore")
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("--api", required=True)
    ap.add_argument("--key", default=os.environ.get("PROGRESS_INGEST_KEY", ""))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    weeks = read_weeks(args.xlsx)
    if args.dry_run or not weeks:
        return 0
    req = urllib.request.Request(
        args.api.rstrip("/") + "/api/close-order/import",
        data=json.dumps({"weeks": weeks}, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "X-Progress-Key": args.key},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        print("Kết quả:", resp.read().decode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
