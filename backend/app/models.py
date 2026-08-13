import enum

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    Unicode,
    UnicodeText,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    to_truong = "to_truong"
    thu_ky = "thu_ky"
    sep = "sep"


class PuGroup(str, enum.Enum):
    PU1 = "PU1"
    PU2 = "PU2"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(Unicode(50), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Unicode(255), nullable=False)
    full_name: Mapped[str] = mapped_column(Unicode(100), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped["DateTime"] = mapped_column(DateTime, server_default=func.now())

    lines: Mapped[list["Line"]] = relationship(back_populates="to_truong", foreign_keys="Line.to_truong_user_id")


class Line(Base):
    __tablename__ = "lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    line_number: Mapped[str] = mapped_column(Unicode(20), unique=True, nullable=False)
    executive_name: Mapped[str] = mapped_column(Unicode(100), nullable=False)
    pu_group: Mapped[PuGroup] = mapped_column(Enum(PuGroup), nullable=False)
    sam: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    target_output: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    target_eff: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    to_truong_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped["DateTime"] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped["DateTime"] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    to_truong: Mapped["User | None"] = relationship(back_populates="lines", foreign_keys=[to_truong_user_id])
    reports: Mapped[list["DailyReport"]] = relationship(back_populates="line")


class DailyReport(Base):
    __tablename__ = "daily_reports"
    __table_args__ = (UniqueConstraint("line_id", "report_date", "shift", name="uq_line_date_shift"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    line_id: Mapped[int] = mapped_column(ForeignKey("lines.id"), nullable=False)
    report_date: Mapped["Date"] = mapped_column(Date, nullable=False, index=True)
    shift: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    # Buyer/style the line is currently running - entered by Tổ trưởng each
    # submission (can change day to day on the same line), not a fixed Line
    # attribute. Always stored upper-case.
    buyer: Mapped[str | None] = mapped_column(Unicode(100), nullable=True)
    out_sew: Mapped[int | None] = mapped_column(Integer, nullable=True)
    eff_sew: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    out_fin_scanpack: Mapped[int | None] = mapped_column(Integer, nullable=True)
    out_fin_fin: Mapped[int | None] = mapped_column(Integer, nullable=True)
    eff_fin: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    wip_fin: Mapped[int | None] = mapped_column(Integer, nullable=True)
    issue_note: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)

    is_submitted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Manual lock flag set by Thư ký/Sếp. Only meaningful when `secretary_override`
    # is True — otherwise the effective lock state is derived from the configurable
    # lock hour (see app.deps.is_past_lock_hour). See resolve_effective_lock().
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    secretary_override: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    submitted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    submitted_at: Mapped["DateTime | None"] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped["DateTime"] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    created_at: Mapped["DateTime"] = mapped_column(DateTime, server_default=func.now())

    line: Mapped["Line"] = relationship(back_populates="reports")
    submitted_by_user: Mapped["User | None"] = relationship(foreign_keys=[submitted_by])
