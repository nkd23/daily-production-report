"""Excel export that reproduces the factory's original daily report layout:

Line | NEW OUT-TAR | NEW EFF-TAR | Buyer | SAM | Shift | OUT-SEW | EFF-SEW |
OUT-FIN(ScanPack) | OUT-FIN(Fin) | EFF-FIN | VAR | WIP FIN | Issue/Lí do

Rows: one per Line, grouped by Executive (subtotal row after each group),
then by PU1/PU2 (subtotal row after each PU), then a final TTL row.
"""

from datetime import date
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.schemas import LineDaySummary

# NOTE: these thresholds are NOT confirmed with the factory yet — they are a
# best guess reproducing the "tô cam / tô hồng" warning look of the original
# file. Adjust here once IE/PPC confirms the real cutoffs. Comparison is the
# ratio of actual efficiency to that line's own target efficiency.
EFF_WARNING_THRESHOLD = 0.75  # ratio actual/target below this -> tô cam (orange)
EFF_CRITICAL_THRESHOLD = 0.60  # ratio actual/target below this -> tô hồng/tím nhạt (pink)

COLUMNS = [
    ("Line", 12),
    ("NEW OUT-TAR", 13),
    ("NEW EFF-TAR", 13),
    ("Buyer", 14),
    ("SAM", 9),
    ("Shift", 8),
    ("OUT-SEW", 11),
    ("EFF-SEW", 11),
    ("OUT-FIN(ScanPack)", 16),
    ("OUT-FIN(Fin)", 13),
    ("EFF-FIN", 11),
    ("VAR", 10),
    ("WIP FIN", 10),
    ("Issue/Lí do", 40),
]

HEADER_FILL = PatternFill("solid", fgColor="1F4E78")
HEADER_FONT = Font(color="FFFFFF", bold=True)
EXEC_FILL = PatternFill("solid", fgColor="DCE6F1")
PU_FILL = PatternFill("solid", fgColor="B8CCE4")
TTL_FILL = PatternFill("solid", fgColor="1F4E78")
TTL_FONT = Font(color="FFFFFF", bold=True)
WARNING_FILL = PatternFill("solid", fgColor="FFC000")
CRITICAL_FILL = PatternFill("solid", fgColor="F4B7C4")
VAR_NEGATIVE_FONT = Font(color="C00000", bold=True)
THIN_BORDER = Border(*(Side(style="thin", color="BFBFBF") for _ in range(4)))


def _avg(values: list[float]) -> float | None:
    values = [v for v in values if v is not None]
    return round(sum(values) / len(values), 2) if values else None


def _eff_fill(actual: float | None, target: float | None):
    if actual is None or not target:
        return None
    ratio = actual / target
    if ratio < EFF_CRITICAL_THRESHOLD:
        return CRITICAL_FILL
    if ratio < EFF_WARNING_THRESHOLD:
        return WARNING_FILL
    return None


def _write_row(ws, row_idx: int, values: list, *, bold=False, fill=None, font=None, number_formats=None):
    for col_idx, value in enumerate(values, start=1):
        cell = ws.cell(row=row_idx, column=col_idx, value=value)
        cell.border = THIN_BORDER
        if fill is not None:
            cell.fill = fill
        if font is not None:
            cell.font = font
        elif bold:
            cell.font = Font(bold=True)
        if number_formats and number_formats.get(col_idx):
            cell.number_format = number_formats[col_idx]
    return row_idx


NUMBER_FORMATS = {
    2: "#,##0",
    3: "0.0\"%\"",
    5: "0.00",
    7: "#,##0",
    8: "0.0\"%\"",
    9: "#,##0",
    10: "#,##0",
    11: "0.0\"%\"",
    12: "#,##0",
    13: "#,##0",
}


def _line_row_values(line: LineDaySummary) -> list:
    return [
        line.line_number,
        line.target_output,
        float(line.target_eff),
        line.buyer,
        float(line.sam),
        line.shift_display,
        line.out_sew,
        float(line.eff_sew) if line.eff_sew is not None else None,
        line.out_fin_scanpack,
        line.out_fin_fin,
        float(line.eff_fin) if line.eff_fin is not None else None,
        line.var,
        line.wip_fin,
        line.issue_note or "",
    ]


def _subtotal_row_values(label: str, items: list[LineDaySummary]) -> list:
    return [
        label,
        sum(i.target_output for i in items),
        _avg([float(i.target_eff) for i in items]),
        "",
        "",
        "",
        sum((i.out_sew or 0) for i in items),
        _avg([float(i.eff_sew) for i in items if i.eff_sew is not None]),
        sum((i.out_fin_scanpack or 0) for i in items),
        sum((i.out_fin_fin or 0) for i in items),
        _avg([float(i.eff_fin) for i in items if i.eff_fin is not None]),
        sum((i.var or 0) for i in items),
        sum((i.wip_fin or 0) for i in items),
        "",
    ]


def generate_daily_excel(lines: list[LineDaySummary], report_date: date) -> BytesIO:
    wb = Workbook()
    ws = wb.active
    ws.title = report_date.isoformat()

    ws.cell(row=1, column=1, value=f"BÁO CÁO SẢN LƯỢNG NGÀY {report_date.strftime('%d/%m/%Y')}").font = Font(
        bold=True, size=14
    )
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(COLUMNS))

    header_row = 3
    for col_idx, (title, width) in enumerate(COLUMNS, start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = width
    _write_row(ws, header_row, [c[0] for c in COLUMNS], fill=HEADER_FILL, font=HEADER_FONT)
    ws.freeze_panes = f"A{header_row + 1}"

    row_idx = header_row + 1

    lines_by_pu: dict[str, list[LineDaySummary]] = {}
    for line in lines:
        lines_by_pu.setdefault(line.pu_group.value, []).append(line)

    for pu_group in sorted(lines_by_pu.keys()):
        pu_lines = lines_by_pu[pu_group]
        lines_by_exec: dict[str, list[LineDaySummary]] = {}
        for line in pu_lines:
            lines_by_exec.setdefault(line.executive_name, []).append(line)

        for executive_name, exec_lines in lines_by_exec.items():
            for line in exec_lines:
                _write_row(ws, row_idx, _line_row_values(line), number_formats=NUMBER_FORMATS)
                eff_sew_fill = _eff_fill(float(line.eff_sew) if line.eff_sew is not None else None, float(line.target_eff))
                if eff_sew_fill:
                    ws.cell(row=row_idx, column=8).fill = eff_sew_fill
                eff_fin_fill = _eff_fill(float(line.eff_fin) if line.eff_fin is not None else None, float(line.target_eff))
                if eff_fin_fill:
                    ws.cell(row=row_idx, column=11).fill = eff_fin_fill
                if line.var is not None and line.var < 0:
                    ws.cell(row=row_idx, column=12).font = VAR_NEGATIVE_FONT
                row_idx += 1

            _write_row(
                ws,
                row_idx,
                _subtotal_row_values(f"{executive_name} - TTL", exec_lines),
                fill=EXEC_FILL,
                bold=True,
                number_formats=NUMBER_FORMATS,
            )
            row_idx += 1

        _write_row(
            ws,
            row_idx,
            _subtotal_row_values(f"{pu_group} - TTL", pu_lines),
            fill=PU_FILL,
            bold=True,
            number_formats=NUMBER_FORMATS,
        )
        row_idx += 1

    _write_row(
        ws,
        row_idx,
        _subtotal_row_values("TTL", lines),
        fill=TTL_FILL,
        font=TTL_FONT,
        number_formats=NUMBER_FORMATS,
    )

    ws.cell(row=header_row, column=1).alignment = Alignment(horizontal="center")
    for row in ws.iter_rows(min_row=header_row, max_row=row_idx, min_col=14, max_col=14):
        for cell in row:
            cell.alignment = Alignment(wrap_text=True, vertical="top")

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer
