from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import local_today, require_dashboard_viewer
from app.models import Line, User, UserRole
from app.schemas import LineTargetRow, LineTargetSet
from app.services.targets import set_target, target_info

# Thư ký / Manager manage every line's target; an Executive only their own
# lines'. Tổ trưởng have no access at all (require_dashboard_viewer excludes them).
router = APIRouter(prefix="/api/targets", tags=["targets"])


def _scoped_lines(db: Session, user: User) -> list[Line]:
    stmt = select(Line).where(Line.is_active == True)  # noqa: E712
    if user.role == UserRole.executive:
        stmt = stmt.where(Line.executive_name == user.executive_name)
    return list(db.scalars(stmt.order_by(Line.pu_group, Line.executive_name, Line.line_number)).all())


def _row(db: Session, line: Line, day: date) -> LineTargetRow:
    return LineTargetRow(
        line_id=line.id,
        line_number=line.line_number,
        executive_name=line.executive_name,
        pu_group=line.pu_group,
        **target_info(db, line.id, day),
    )


@router.get("", response_model=list[LineTargetRow])
def list_targets(
    as_of: date = Query(default_factory=local_today),
    current_user: User = Depends(require_dashboard_viewer),
    db: Session = Depends(get_db),
):
    """Target in force on `as_of` for every line the user manages."""
    return [_row(db, line, as_of) for line in _scoped_lines(db, current_user)]


@router.put("/{line_id}", response_model=LineTargetRow)
def update_target(
    line_id: int,
    payload: LineTargetSet,
    current_user: User = Depends(require_dashboard_viewer),
    db: Session = Depends(get_db),
):
    line = db.get(Line, line_id)
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy line")
    if current_user.role == UserRole.executive and line.executive_name != current_user.executive_name:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không phụ trách line này")
    set_target(db, line, payload.effective_from, payload.target_output, payload.target_eff, current_user)
    db.commit()
    return _row(db, line, payload.effective_from)
