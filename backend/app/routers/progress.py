import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import local_now, local_today, require_dashboard_viewer
from app.models import ProgressNote, User
from app.schemas import ProgressIngest, ProgressNoteOut, ProgressNoteUpdate, ProgressResponse
from app.services.progress import build_view, can_edit_order, ingest

router = APIRouter(prefix="/api/progress", tags=["progress"])
settings = get_settings()


@router.post("/ingest", include_in_schema=False)
def ingest_progress(
    payload: ProgressIngest,
    x_progress_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Called by the progress agent on the office PC each morning."""
    if not settings.progress_ingest_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Chưa cấu hình PROGRESS_INGEST_KEY")
    if not secrets.compare_digest(x_progress_key or "", settings.progress_ingest_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sai khóa")
    # An empty folder almost always means a broken sync or wrong path, not
    # that every order finished overnight - keep yesterday's data instead.
    if not payload.sources:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không có file bảng tiến độ nào")
    result = ingest(db, payload, local_now().replace(tzinfo=None))
    db.commit()
    return result


@router.get("", response_model=ProgressResponse)
def get_progress(
    include_hidden: bool = Query(default=False),
    current_user: User = Depends(require_dashboard_viewer),
    db: Session = Depends(get_db),
):
    return build_view(db, current_user, local_today(), include_hidden)


@router.put("/notes", response_model=ProgressNoteOut)
def update_note(
    payload: ProgressNoteUpdate,
    current_user: User = Depends(require_dashboard_viewer),
    db: Session = Depends(get_db),
):
    allowed = can_edit_order(db, current_user, payload.order_key)
    if allowed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Đơn này không còn trong bảng tiến độ")
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không phụ trách line của đơn này")

    now = local_now().replace(tzinfo=None)
    note = db.scalar(select(ProgressNote).where(ProgressNote.order_key == payload.order_key))
    if note is None:
        note = ProgressNote(order_key=payload.order_key, is_closed=False)
        db.add(note)
    sent = payload.model_fields_set
    if "ex_remark" in sent:
        note.ex_remark = (payload.ex_remark or "").strip() or None
    if "fin_remark" in sent:
        note.fin_remark = (payload.fin_remark or "").strip() or None
    if "is_closed" in sent and payload.is_closed is not None and payload.is_closed != note.is_closed:
        note.is_closed = payload.is_closed
        note.closed_by = current_user.full_name if payload.is_closed else None
        note.closed_at = now if payload.is_closed else None
    note.updated_by = current_user.full_name
    note.updated_at = now
    db.commit()
    return ProgressNoteOut(
        order_key=note.order_key,
        ex_remark=note.ex_remark,
        fin_remark=note.fin_remark,
        is_closed=note.is_closed,
        closed_by=note.closed_by,
        closed_at=note.closed_at,
    )


@router.get("/excel")
def export_progress_excel(
    include_hidden: bool = Query(default=False),
    current_user: User = Depends(require_dashboard_viewer),
    db: Session = Depends(get_db),
):
    # openpyxl only loads for this endpoint (cold-start cost on Vercel).
    from app.services.progress_excel import generate_progress_excel

    today = local_today()
    view = build_view(db, current_user, today, include_hidden)
    buffer = generate_progress_excel(view["orders"], today)
    filename = f"TienDoDonHang_{today.strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
