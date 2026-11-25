import logging
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import local_now
from app.services import zalo_alerts
from app.services.zalo_bot import handle_text
from app.services.zalo_client import send_text

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/zalo", tags=["zalo"])
settings = get_settings()


def _now():
    return local_now().replace(tzinfo=None)


@router.post("/webhook", include_in_schema=False)
async def webhook(
    request: Request,
    x_bot_api_secret_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Zalo calls this for every message the bot receives (in a group: only
    those that tag the bot or reply to it)."""
    if not settings.zalo_webhook_secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE)
    if not secrets.compare_digest(x_bot_api_secret_token or "", settings.zalo_webhook_secret):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    try:
        body = await request.json()
    except ValueError:
        return {"ok": True}
    if isinstance(body, dict) and "message" not in body and isinstance(body.get("result"), dict):
        body = body["result"]  # the docs show both shapes
    if not isinstance(body, dict) or body.get("event_name") != "message.text.received":
        return {"ok": True}
    message = body.get("message") or {}
    chat = message.get("chat") or {}
    sender = message.get("from") or {}
    chat_id = str(chat.get("id") or "")
    if not chat_id or sender.get("is_bot"):
        return {"ok": True}

    now = _now()
    # Zalo may deliver the same message again: answer it once.
    message_id = str(message.get("message_id") or "")
    seen_key = f"lastmsg:{chat_id}"
    if message_id and zalo_alerts.state_get(db, seen_key) == message_id:
        return {"ok": True}
    if message_id:
        zalo_alerts.state_set(db, seen_key, message_id, now)
    try:
        reply = handle_text(db, chat_id, str(chat.get("chat_type") or "PRIVATE"), str(message.get("text") or ""), now)
        db.commit()
    except Exception:  # never let one bad message make Zalo retry forever
        db.rollback()
        log.exception("zalo bot failed on a message")
        reply = "Xin lỗi, bot đang gặp lỗi. Thử lại sau ít phút."
    if reply:
        send_text(chat_id, reply)
    return {"ok": True}


# ----------------------------------------------------------- Vercel Cron

def _check_cron(authorization: str | None) -> None:
    if not settings.cron_secret or not secrets.compare_digest(authorization or "", f"Bearer {settings.cron_secret}"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


def _run_cron(job, db: Session) -> dict:
    result = job(db, _now())
    db.commit()
    return {"result": result}


@router.get("/cron/progress-check", include_in_schema=False)
def cron_progress_check(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    _check_cron(authorization)
    return _run_cron(zalo_alerts.cron_progress_check, db)


@router.get("/cron/draft-reminder", include_in_schema=False)
def cron_draft_reminder(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    _check_cron(authorization)
    return _run_cron(zalo_alerts.cron_draft_reminder, db)


@router.get("/cron/publish-check", include_in_schema=False)
def cron_publish_check(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    _check_cron(authorization)
    return _run_cron(zalo_alerts.cron_publish_check, db)
