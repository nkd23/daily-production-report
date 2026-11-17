import secrets
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import local_now, local_today, require_dashboard_viewer, require_finishing_editor, require_sep_only
from app.models import CloseOrderItem, Holiday, User
from app.schemas import (
    CloseOrderImport,
    CloseOrderIngest,
    CloseOrderItemOut,
    CloseOrderItemUpdate,
    CloseOrderWeekOut,
    CloseOrderWeekView,
    HolidayIn,
    HolidayOut,
)
from app.services.close_order import (
    DEPARTMENTS,
    _line_map,
    holiday_set,
    import_weeks,
    ingest,
    item_out,
    list_weeks,
    week_view,
)

router = APIRouter(prefix="/api/close-order", tags=["close-order"])
settings = get_settings()


def _check_key(key: str | None) -> None:
    if not settings.progress_ingest_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Chưa cấu hình PROGRESS_INGEST_KEY")
    if not secrets.compare_digest(key or "", settings.progress_ingest_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sai khóa")


@router.post("/ingest", include_in_schema=False)
def ingest_close_order(
    payload: CloseOrderIngest,
    x_progress_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Called by the agent's --close-order run (Thursday 15:00); publishes
    last week's Close order list."""
    _check_key(x_progress_key)
    if not payload.sources:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không có file bảng tiến độ nào")
    result = ingest(db, payload, local_now().replace(tzinfo=None))
    db.commit()
    return result


@router.post("/import", include_in_schema=False)
def import_old_report(
    payload: CloseOrderImport,
    x_progress_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """One-off: weeks from the old Excel Close Order Report."""
    _check_key(x_progress_key)
    result = import_weeks(db, payload, local_now().replace(tzinfo=None))
    db.commit()
    return result


@router.get("/weeks", response_model=list[CloseOrderWeekOut])
def get_weeks(current_user: User = Depends(require_dashboard_viewer), db: Session = Depends(get_db)):
    return list_weeks(db, current_user, local_today())


def _view_or_404(db: Session, user: User, week_start: date) -> dict:
    view = week_view(db, user, week_start, local_today())
    if view is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tuần này chưa có Close order")
    return view


@router.get("", response_model=CloseOrderWeekView)
def get_week(
    week_start: date = Query(...),
    current_user: User = Depends(require_dashboard_viewer),
    db: Session = Depends(get_db),
):
    return _view_or_404(db, current_user, week_start)


@router.put("/items/{item_id}", response_model=CloseOrderItemOut)
def update_item(
    item_id: int,
    payload: CloseOrderItemUpdate,
    current_user: User = Depends(require_finishing_editor),
    db: Session = Depends(get_db),
):
    item = db.get(CloseOrderItem, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy đơn")
    sent = payload.model_fields_set
    if "wf" in sent:
        item.wf = payload.wf
    if "remark" in sent:
        item.remark = (payload.remark or "").strip() or None
    if "department" in sent:
        dept = (payload.department or "").strip() or None
        if dept is not None and dept not in DEPARTMENTS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bộ phận không hợp lệ")
        item.department = dept
    item.updated_by = current_user.full_name
    item.updated_at = local_now().replace(tzinfo=None)
    db.commit()
    return item_out(item, _line_map(db), local_today(), holiday_set(db))


@router.get("/holidays", response_model=list[HolidayOut])
def get_holidays(current_user: User = Depends(require_dashboard_viewer), db: Session = Depends(get_db)):
    return db.scalars(select(Holiday).order_by(Holiday.day.desc())).all()


@router.post("/holidays", response_model=HolidayOut, status_code=status.HTTP_201_CREATED)
def add_holiday(payload: HolidayIn, current_user: User = Depends(require_sep_only), db: Session = Depends(get_db)):
    if db.scalar(select(Holiday).where(Holiday.day == payload.day)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ngày này đã có trong danh sách")
    holiday = Holiday(day=payload.day, name=(payload.name or "").strip() or None)
    db.add(holiday)
    db.commit()
    db.refresh(holiday)
    return holiday


@router.delete("/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holiday(holiday_id: int, current_user: User = Depends(require_sep_only), db: Session = Depends(get_db)):
    holiday = db.get(Holiday, holiday_id)
    if holiday is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy ngày lễ")
    db.delete(holiday)
    db.commit()


@router.get("/excel")
def export_week(
    week_start: date = Query(...),
    current_user: User = Depends(require_dashboard_viewer),
    db: Session = Depends(get_db),
):
    from app.services.progress_excel import generate_close_order_excel

    view = _view_or_404(db, current_user, week_start)
    buffer = generate_close_order_excel(view)
    filename = f"CloseOrder_{view['week_start']:%Y%m%d}-{view['week_end']:%Y%m%d}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
