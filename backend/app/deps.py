from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User, UserRole
from app.security import decode_access_token

settings = get_settings()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Không xác thực được người dùng",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    user = db.get(User, int(user_id))
    if user is None or not user.is_active:
        raise credentials_exception
    return user


def require_roles(*roles: UserRole):
    def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền thực hiện thao tác này")
        return current_user

    return checker


require_thu_ky_or_sep = require_roles(UserRole.thu_ky, UserRole.sep)
require_sep_only = require_roles(UserRole.sep)
require_any_role = require_roles(UserRole.to_truong, UserRole.thu_ky, UserRole.sep)


def local_now() -> datetime:
    return datetime.now(ZoneInfo(settings.app_timezone))


def local_today() -> date:
    return local_now().date()


def is_past_lock_hour(report_date: date) -> bool:
    """Reports for a past date are always locked. Reports for today are locked
    once local time passes the configured lock hour."""
    today = local_today()
    if report_date < today:
        return True
    if report_date > today:
        return False
    return local_now().hour >= settings.report_lock_hour


def resolve_effective_lock(report_date: date, is_locked: bool, secretary_override: bool) -> bool:
    """A Thư ký/Sếp action always wins over the automatic time-based lock
    (e.g. explicitly unlocking a report after the lock hour has passed keeps
    it editable for Tổ trưởng until locked again)."""
    if secretary_override:
        return is_locked
    return is_past_lock_hour(report_date)
