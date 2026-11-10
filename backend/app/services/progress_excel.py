"""Excel download of the Tiến độ đơn hàng page, laid out like the old
hand-made "daily" file (one sheet per Executive, same column order) so
people used to that file find everything where it was."""

from collections import defaultdict
from datetime import date
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.services.progress import UNASSIGNED_EXECUTIVE, parse_iso

COLUMNS = [
    ("Line", "line_number", 8),
    ("Byr", "buyer", 12),
    ("JO", "jo", 16),
    ("BPO date", "bpo_date", 11),
    ("Shipment plan", "shipment_plan", 12),
    ("Order carton", "order_carton", 11),
    ("Start sew", "start_sew", 11),
    ("End sew", "end_sew", 11),
    ("End pack", "end_pack", 11),
    ("Order qty", "order_qty", 9),
    ("Allocate qty", "allocate_qty", 9),
    ("Cut qty", "cut_qty", 9),
    ("Sew qty", "sew_qty", 9),
    ("Pack qty", "pack_qty", 9),
    ("Pack - cut", "pack_cut", 9),
    ("late", "late", 9),
    ("WF", "product_category", 11),
    ("Color", "color", 14),
    ("EX REMARK", "ex_remark", 24),
    ("FIN REMARK", "fin_remark", 24),
    ("Cust. Style No", "cust_style_no", 16),
    ("Nguồn", "source_owner", 10),
]
DATE_FIELDS = {"bpo_date", "shipment_plan", "order_carton", "start_sew", "end_sew", "end_pack"}

HEADER_FILL = PatternFill("solid", fgColor="1F4E78")
HEADER_FONT = Font(bold=True, color="FFFFFF")
NEGATIVE_FONT = Font(color="C00000")
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def _sheet_title(name: str, used: set[str]) -> str:
    title = "".join(ch for ch in name if ch not in '[]:*?/\\')[:31] or "Sheet"
    base, n = title, 2
    while title in used:
        title = f"{base[:28]} ({n})"
        n += 1
    used.add(title)
    return title


def generate_progress_excel(orders: list[dict], today: date) -> BytesIO:
    groups: dict[str, list[dict]] = defaultdict(list)
    for o in orders:
        groups[o["executive_name"] or UNASSIGNED_EXECUTIVE].append(o)

    wb = Workbook()
    wb.remove(wb.active)
    used: set[str] = set()
    names = sorted(groups, key=lambda n: (n == UNASSIGNED_EXECUTIVE, n))
    if not names:
        names = ["Tiến độ"]
    for name in names:
        ws = wb.create_sheet(_sheet_title(name, used))
        for c, (label, _, width) in enumerate(COLUMNS, start=1):
            cell = ws.cell(row=1, column=c, value=label)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = BORDER
            ws.column_dimensions[get_column_letter(c)].width = width
        for r, o in enumerate(groups.get(name, []), start=2):
            for c, (_, field, _) in enumerate(COLUMNS, start=1):
                value = o.get(field)
                if field == "late" and value is None:
                    value = o.get("late_label")
                cell = ws.cell(row=r, column=c)
                if field in DATE_FIELDS:
                    parsed = parse_iso(value)
                    cell.value = parsed if parsed else value
                    if parsed:
                        cell.number_format = "dd/mm/yyyy"
                else:
                    cell.value = value
                cell.border = BORDER
                if field == "pack_cut" and isinstance(value, int) and value < 0:
                    cell.font = NEGATIVE_FONT
        ws.freeze_panes = "D2"
        ws.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNS))}{max(ws.max_row, 1)}"

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer
