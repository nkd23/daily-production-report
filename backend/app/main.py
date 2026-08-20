from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import SessionLocal
from app.routers import auth, dashboard, export, lines, reports, users
from app.services.retention import purge_old_reports

settings = get_settings()


def _run_retention_purge() -> None:
    db = SessionLocal()
    try:
        purge_old_reports(db)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = BackgroundScheduler(timezone=settings.app_timezone)
    # Runs once at startup (catches up if the server was down past midnight)
    # and then daily at 02:00 local time, when no one is using the app.
    scheduler.add_job(_run_retention_purge, CronTrigger(hour=2, minute=0))
    scheduler.add_job(_run_retention_purge)
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="Daily Production Report API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
