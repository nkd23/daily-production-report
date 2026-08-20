from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_thu_ky_or_sep
from app.models import DailyReport, Line, ReportHistory, User, UserRole
from app.schemas import UserCreate, UserOut, UserUpdate
from app.security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"], dependencies=[Depends(require_thu_ky_or_sep)])


@router.get("", response_model=list[UserOut])
def list_users(role: UserRole | None = None, db: Session = Depends(get_db)):
    stmt = select(User)
    if role is not None:
        stmt = stmt.where(User.role == role)
    return db.scalars(stmt.order_by(User.full_name)).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.username == payload.username))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tên đăng nhập đã tồn tại")
    if payload.role == UserRole.executive and not payload.executive_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tài khoản Executive phải chọn đúng tên Executive (khớp với Cấu hình Line)",
        )
    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        executive_name=payload.executive_name if payload.role == UserRole.executive else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng")
    if payload.username is not None and payload.username != user.username:
        existing = db.scalar(select(User).where(User.username == payload.username, User.id != user_id))
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tên đăng nhập đã tồn tại")
        user.username = payload.username
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.executive_name is not None:
        user.executive_name = payload.executive_name
    if payload.password is not None and payload.password != "":
        user.password_hash = hash_password(payload.password)
    if payload.is_active is not None:
        user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, current_user: User = Depends(require_thu_ky_or_sep), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng")
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể tự xóa tài khoản của chính mình")
    # Any account type may be deleted (Tổ trưởng, Executive, Thư ký, Manager)
    # - the restriction is on who may perform the deletion (require_thu_ky_or_sep
    # above), not on which accounts are deletable.
    #
    # submitted_by/changed_by are audit references, not ownership - null them
    # out so the DailyReport/ReportHistory rows (and the audit trail itself)
    # survive the account being removed, same principle as ReportHistory's
    # own docstring about surviving a deleted daily_reports row.
    db.query(DailyReport).filter(DailyReport.submitted_by == user.id).update({"submitted_by": None})
    db.query(ReportHistory).filter(ReportHistory.changed_by == user.id).update({"changed_by": None})
    # A Tổ trưởng account may be assigned to lines - unassign rather than
    # leave a dangling reference.
    db.query(Line).filter(Line.to_truong_user_id == user.id).update({"to_truong_user_id": None})
    db.delete(user)
    db.commit()
