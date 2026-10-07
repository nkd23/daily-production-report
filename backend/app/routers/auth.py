from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import login_throttle
from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import ChangePasswordRequest, LoginRequest, Token, UserOut
from app.security import create_access_token, hash_password, verify_and_upgrade, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


def _client_ip(request: Request) -> str:
    # Vercel overwrites X-Real-IP / X-Forwarded-For with the visitor's own IP,
    # so they can't be spoofed there. Elsewhere (Docker behind Caddy) uvicorn's
    # --proxy-headers already puts the real IP in request.client.
    if settings.is_serverless:
        forwarded = request.headers.get("x-real-ip") or request.headers.get("x-forwarded-for", "").split(",")[0]
        if forwarded.strip():
            return forwarded.strip()
    return request.client.host if request.client else "unknown"


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    wait = login_throttle.retry_after_seconds(db, ip, payload.username)
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau {wait // 60 + 1} phút.",
            headers={"Retry-After": str(wait)},
        )

    user = db.scalar(select(User).where(User.username == payload.username))
    valid, upgraded_hash = (False, None) if user is None else verify_and_upgrade(payload.password, user.password_hash)
    if user is None or not user.is_active or not valid:
        login_throttle.record_failure(db, ip, payload.username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sai tên đăng nhập hoặc mật khẩu")

    if upgraded_hash:
        user.password_hash = upgraded_hash
    login_throttle.record_success(db, ip, payload.username)
    token = create_access_token(subject=str(user.id), extra_claims={"role": user.role.value})
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/change-password", response_model=UserOut)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu hiện tại không đúng")
    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    db.refresh(current_user)
    return current_user
