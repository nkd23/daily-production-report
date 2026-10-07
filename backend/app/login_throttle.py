"""Brake on password guessing for /api/auth/login.

Two limits over a sliding 15-minute window of failed attempts:
- per (client IP, username): stops guessing one account's password;
- per client IP alone, set much higher because every phone on the factory
  Wi-Fi reaches the server from the same public IP.

Failures are stored in the database so all server worker processes share
one count.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import LoginFailure

WINDOW = timedelta(minutes=15)
MAX_FAILURES_PER_ACCOUNT = 5
MAX_FAILURES_PER_IP = 30


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _keys(ip: str, username: str) -> list[tuple[str, int]]:
    account = f"acct|{ip}|{username.strip().lower()}"[:200]
    return [(account, MAX_FAILURES_PER_ACCOUNT), (f"ip|{ip}"[:200], MAX_FAILURES_PER_IP)]


def retry_after_seconds(db: Session, ip: str, username: str) -> int:
    """0 if a login attempt is allowed, otherwise seconds until it will be."""
    now = _now()
    wait = 0
    for key, limit in _keys(ip, username):
        count, oldest = db.execute(
            select(func.count(), func.min(LoginFailure.failed_at)).where(
                LoginFailure.throttle_key == key, LoginFailure.failed_at > now - WINDOW
            )
        ).one()
        if count >= limit:
            wait = max(wait, int((oldest + WINDOW - now).total_seconds()) + 1)
    return wait


def record_failure(db: Session, ip: str, username: str) -> None:
    now = _now()
    db.execute(delete(LoginFailure).where(LoginFailure.failed_at <= now - WINDOW))
    db.add_all([LoginFailure(throttle_key=key, failed_at=now) for key, _ in _keys(ip, username)])
    db.commit()


def record_success(db: Session, ip: str, username: str) -> None:
    db.execute(delete(LoginFailure).where(LoginFailure.throttle_key == _keys(ip, username)[0][0]))
    db.commit()
