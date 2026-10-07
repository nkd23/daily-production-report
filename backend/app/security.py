from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

settings = get_settings()
# Cost 10 (~60ms per check) instead of passlib's default 12 (~240ms): at 12,
# a shift's worth of people logging in at once saturates the server's CPU.
# 10 is OWASP's minimum for bcrypt; online guessing is separately capped by
# app.login_throttle. Older cost-12 hashes are upgraded on next login.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=10)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def verify_and_upgrade(plain_password: str, password_hash: str) -> tuple[bool, str | None]:
    """Like verify_password, plus a replacement hash when the stored one uses
    an outdated cost - the caller should save it."""
    return pwd_context.verify_and_update(plain_password, password_hash)


def create_access_token(subject: str, extra_claims: dict | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return None
