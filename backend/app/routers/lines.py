from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_thu_ky_or_sep
from app.models import Line, User, UserRole
from app.schemas import LineCreate, LineOut, LineUpdate

router = APIRouter(prefix="/api/lines", tags=["lines"])


def _to_line_out(line: Line) -> LineOut:
    out = LineOut.model_validate(line)
    out.to_truong_name = line.to_truong.full_name if line.to_truong else None
    return out


@router.get("", response_model=list[LineOut])
def list_lines(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Line)
    if not include_inactive:
        stmt = stmt.where(Line.is_active == True)  # noqa: E712

    if current_user.role == UserRole.to_truong:
        stmt = stmt.where(Line.to_truong_user_id == current_user.id)

    stmt = stmt.order_by(Line.pu_group, Line.executive_name, Line.display_order, Line.line_number)
    lines = db.scalars(stmt).all()
    return [_to_line_out(line) for line in lines]


@router.post("", response_model=LineOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_thu_ky_or_sep)])
def create_line(payload: LineCreate, db: Session = Depends(get_db)):
    existing = db.scalar(select(Line).where(Line.line_number == payload.line_number))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Line đã tồn tại")
    line = Line(**payload.model_dump())
    db.add(line)
    db.commit()
    db.refresh(line)
    return _to_line_out(line)


@router.patch("/{line_id}", response_model=LineOut, dependencies=[Depends(require_thu_ky_or_sep)])
def update_line(line_id: int, payload: LineUpdate, db: Session = Depends(get_db)):
    line = db.get(Line, line_id)
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy line")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(line, field, value)
    db.commit()
    db.refresh(line)
    return _to_line_out(line)


@router.delete("/{line_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_thu_ky_or_sep)])
def deactivate_line(line_id: int, db: Session = Depends(get_db)):
    line = db.get(Line, line_id)
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy line")
    line.is_active = False
    db.commit()
