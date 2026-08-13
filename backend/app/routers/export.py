from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import local_today, require_thu_ky_or_sep
from app.services.aggregation import build_executive_summaries, build_issue_list, build_kpi_summary, build_line_summaries
from app.services.excel_export import generate_daily_excel

router = APIRouter(prefix="/api/export", tags=["export"], dependencies=[Depends(require_thu_ky_or_sep)])


@router.get("/excel")
def export_excel(report_date: date = Query(default_factory=local_today), db: Session = Depends(get_db)):
    lines = build_line_summaries(db, report_date)
    kpi = build_kpi_summary(lines)
    executives = build_executive_summaries(lines)
    issues = build_issue_list(lines)
    buffer = generate_daily_excel(lines, report_date, kpi=kpi, executives=executives, issues=issues)
    filename = f"BaoCaoSanLuong_{report_date.strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
