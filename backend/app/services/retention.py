import logging
from datetime import timedelta

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import local_today
from app.models import DailyReport, ReportHistory

logger = logging.getLogger("app.retention")
settings = get_settings()


def purge_old_reports(db: Session) -> int:
    """Permanently deletes daily_reports/report_history rows older than
    `data_retention_days`. Hard delete with no backup - the retention window
    and no-backup behavior were explicitly confirmed by the factory (not the
    app's own decision). Returns the number of daily_reports rows removed."""
    if settings.data_retention_days <= 0:
        return 0
    cutoff = local_today() - timedelta(days=settings.data_retention_days)
    deleted_reports = db.execute(
        delete(DailyReport).where(DailyReport.report_date < cutoff)
    ).rowcount
    db.execute(delete(ReportHistory).where(ReportHistory.report_date < cutoff))
    db.commit()
    if deleted_reports:
        logger.info("Retention purge: removed %d daily_reports rows older than %s", deleted_reports, cutoff)
    return deleted_reports
