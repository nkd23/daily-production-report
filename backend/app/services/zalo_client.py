"""Sending messages through the Zalo Bot API (bot.zapps.me).

https://bot-api.zaloplatforms.com/bot<TOKEN>/sendMessage, JSON
{"chat_id", "text"}; a text is 1-2000 characters, so longer messages go
out in several parts, split between lines. Without a token (local
development) messages are only logged and kept in OUTBOX.

The token is part of the URL, so nothing here ever logs a URL."""

import json
import logging
import urllib.error
import urllib.request

from app.config import get_settings

log = logging.getLogger(__name__)

API_BASE = "https://bot-api.zaloplatforms.com/bot"
MAX_TEXT = 1900  # under Zalo's 2000, leaving room for "(1/2)"
TIMEOUT_SECONDS = 8

# Local development / tests: (chat_id, text) of every message "sent".
OUTBOX: list[tuple[str, str]] = []


def split_text(text: str, limit: int = MAX_TEXT) -> list[str]:
    parts: list[str] = []
    current = ""
    for line in text.splitlines():
        while len(line) > limit:  # one very long line (e.g. a remark)
            if current:
                parts.append(current)
                current = ""
            parts.append(line[:limit])
            line = line[limit:]
        candidate = f"{current}\n{line}" if current else line
        if len(candidate) > limit:
            # Prefer to cut at the last blank line (between blocks).
            cut = current.rfind("\n\n")
            if cut > limit // 3:
                parts.append(current[:cut])
                current = f"{current[cut + 2:]}\n{line}"
            else:
                parts.append(current)
                current = line
        else:
            current = candidate
    if current.strip():
        parts.append(current)
    if len(parts) > 1:
        parts = [f"{p}\n({i}/{len(parts)})" for i, p in enumerate(parts, 1)]
    return parts or [text[:limit] or "."]


def _call(method: str, payload: dict) -> dict:
    token = get_settings().zalo_bot_token
    req = urllib.request.Request(
        f"{API_BASE}{token}/{method}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode("utf-8") or "{}")
        except ValueError:
            body = {}
        return {"ok": False, "error_code": body.get("error_code", exc.code), "description": body.get("description")}
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        return {"ok": False, "error_code": None, "description": type(exc).__name__}


def send_text(chat_id: str, text: str) -> bool:
    """Send one message (in parts if long). Never raises: a failed send is
    logged and reported as False, so it can't break the caller."""
    ok = True
    for part in split_text(text):
        if not get_settings().zalo_bot_token:
            OUTBOX.append((chat_id, part))
            log.info("zalo (not sent, no token) to %s:\n%s", chat_id, part)
            continue
        result = _call("sendMessage", {"chat_id": chat_id, "text": part})
        if not result.get("ok"):
            ok = False
            log.warning("zalo sendMessage failed: %s %s", result.get("error_code"), result.get("description"))
            break
    return ok


def bot_info() -> dict | None:
    if not get_settings().zalo_bot_token:
        return None
    result = _call("getMe", {})
    return result.get("result") if result.get("ok") else None
