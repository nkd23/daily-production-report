import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.config import PLACEHOLDER_SECRET_PREFIXES, get_settings
from app.database import SessionLocal
from app.routers import auth, dashboard, export, lines, reports, users
from app.services.retention import purge_old_reports

settings = get_settings()

# Anyone who knows the signing key can mint a valid login token for any
# account, so a public deployment must never run on the sample value.
if settings.is_production and (
    len(settings.secret_key) < 32 or settings.secret_key.lower().startswith(PLACEHOLDER_SECRET_PREFIXES)
):
    raise RuntimeError("SECRET_KEY is missing or a placeholder - set a long random value before running in production.")


def _run_retention_purge() -> None:
    db = SessionLocal()
    try:
        purge_old_reports(db)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # On Vercel a function instance is frozen between requests, so an
    # in-process scheduler can't be relied on; Vercel Cron calls
    # /api/cron/retention instead (see backend/vercel.json).
    if settings.is_serverless:
        yield
        return
    # Imported only here so serverless cold starts don't pay for it (~0.3s).
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger

    scheduler = BackgroundScheduler(timezone=settings.app_timezone)
    # Runs once at startup (catches up if the server was down past midnight)
    # and then daily at 02:00 local time, when no one is using the app.
    scheduler.add_job(_run_retention_purge, CronTrigger(hour=2, minute=0))
    scheduler.add_job(_run_retention_purge)
    scheduler.start()
    yield
    scheduler.shutdown()


_docs = {"docs_url": None, "redoc_url": None, "openapi_url": None} if settings.is_production else {}
app = FastAPI(title="Daily Production Report API", version="1.0.0", lifespan=lifespan, **_docs)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # The frontend calls the API cross-origin with an Authorization header,
    # so every new URL needs a preflight; let browsers cache them longer.
    max_age=86400,
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(lines.router)
app.include_router(reports.router)
app.include_router(dashboard.router)
app.include_router(export.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/cron/retention", include_in_schema=False)
def cron_retention(authorization: str | None = Header(default=None)):
    if not settings.cron_secret or not secrets.compare_digest(
        authorization or "", f"Bearer {settings.cron_secret}"
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    db = SessionLocal()
    try:
        return {"deleted_reports": purge_old_reports(db)}
    finally:
        db.close()
