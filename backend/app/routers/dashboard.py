from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import local_today, require_thu_ky_or_sep
from app.schemas import DashboardResponse
from app.services.aggregation import build_dashboard

router = APIRouter(
    prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(require_thu_ky_or_sep)]
)


def _default_dashboard_date() -> date:
    # Sếp reviews yesterday's numbers each morning before the meeting.
    return local_today() - timedelta(days=1)


@router.get("/summary", response_model=DashboardResponse)
def dashboard_summary(
    report_date: date = Query(default_factory=_default_dashboard_date),
    db: Session = Depends(get_db),
):
    return build_dashboard(db, report_date)
