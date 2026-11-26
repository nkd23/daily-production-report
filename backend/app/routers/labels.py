import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import local_now
from app.services.labels import after_carton_ingest, after_label_ingest, ingest, ingest_cartons
from app.services.zalo_alerts import run_safely

router = APIRouter(prefix="/api/labels", tags=["labels"])
settings = get_settings()


class LabelIngest(BaseModel):
    """What Duy's label-ordering tool pushes (its DuLieuWeb files)."""

    summary: dict
    due: list[dict] = Field(default_factory=list, max_length=1000)
    orders: list[dict] = Field(default_factory=list, max_length=5000)
    new_srn: list[dict] = Field(default_factory=list, max_length=500)


class CartonIngest(BaseModel):
    """Carton labels (SRN CTN) from a new CT pre-packing list, pushed by n8n."""

    can_dat: list[dict] = Field(default_factory=list, max_length=500)
    da_dat: list[dict] = Field(default_factory=list, max_length=500)
    can_xem: list[dict] = Field(default_factory=list, max_length=500)


def _check_key(x_label_key: str | None) -> None:
    expected = settings.label_ingest_key.strip().lstrip("﻿")
    if not expected:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Chưa cấu hình LABEL_INGEST_KEY")
    # Compare bytes: str compare_digest raises on non-ASCII input (-> 500 instead of 401).
    if not secrets.compare_digest((x_label_key or "").strip().encode(), expected.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sai khóa")


@router.post("/ingest", include_in_schema=False)
def ingest_labels(
    payload: LabelIngest,
    x_label_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Called by the label-ordering tool (n8n / Duy's PC) after each run."""
    _check_key(x_label_key)
    now = local_now().replace(tzinfo=None)
    result = ingest(db, payload, now)
    db.commit()
    run_safely(after_label_ingest, db, now, payload.new_srn)
    return result


@router.post("/cartons", include_in_schema=False)
def ingest_carton_labels(
    payload: CartonIngest,
    x_label_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Called by n8n when a new CT pre-packing list lands in 'PrePKL CT - NEW'."""
    _check_key(x_label_key)
    now = local_now().replace(tzinfo=None)
    result = ingest_cartons(db, payload, now)
    db.commit()
    run_safely(after_carton_ingest, db, now, payload)
    return result
