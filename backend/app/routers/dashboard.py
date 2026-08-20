from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, local_today, require_dashboard_viewer
from app.models import User, UserRole
from app.schemas import DashboardResponse
from app.services.aggregation import build_dashboard

router = APIRouter(
    prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(require_dashboard_viewer)]
)


def _default_dashboard_date() -> date:
    # Sếp reviews yesterday's numbers each morning before the meeting.
    return local_today() - timedelta(days=1)


@router.get("/summary", response_model=DashboardResponse)
def dashboard_summary(
    report_date: date = Query(default_factory=_default_dashboard_date),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scope = current_user.executive_name if current_user.role == UserRole.executive else None
    return build_dashboard(db, report_date, executive_scope=scope)
