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
    executive = "executive"


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
    # Only set for role=executive - must match a Line.executive_name exactly
    # (e.g. "Ms Thảo") so the dashboard can be scoped to just that person's
    # own lines. Unused/null for every other role.
    executive_name: Mapped[str | None] = mapped_column(Unicode(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped["DateTime"] = mapped_column(DateTime, server_default=func.now())

    lines: Mapped[list["Line"]] = relationship(back_populates="to_truong", foreign_keys="Line.to_truong_user_id")


class Line(Base):
    __tablename__ = "lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    line_number: Mapped[str] = mapped_column(Unicode(20), unique=True, nullable=False)
    executive_name: Mapped[str] = mapped_column(Unicode(100), nullable=False)
    pu_group: Mapped[PuGroup] = mapped_column(Enum(PuGroup), nullable=False)
    # Not read anywhere in the app's calculations - SAM is entered on each
    # daily_reports row and targets come from line_targets (see
    # app.services.targets). Only editable via "Cấu hình Line", purely for
    # admin reference - has no effect on the Dashboard, entry form, or Excel
    # export.
    sam: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    target_output: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    target_eff: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    # One Tổ trưởng account per line - the entry form has a "Số ca chạy" field
    # so the same person reports however many shifts (1 or 2) the line ran.
    to_truong_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped["DateTime"] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped["DateTime"] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    to_truong: Mapped["User | None"] = relationship(back_populates="lines", foreign_keys=[to_truong_user_id])
    reports: Mapped[list["DailyReport"]] = relationship(back_populates="line")


class DailyReport(Base):
    __tablename__ = "daily_reports"
    __table_args__ = (UniqueConstraint("line_id", "report_date", name="uq_line_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    line_id: Mapped[int] = mapped_column(ForeignKey("lines.id"), nullable=False)
    report_date: Mapped["Date"] = mapped_column(Date, nullable=False, index=True)
    # How many shifts (1 or 2) the line ran this day - the factory's "tổng số
    # Ca" column, entered directly by the Tổ trưởng rather than inferred from
    # how many separate submissions exist (there is only ever one row per
    # line/date; see app.services.aggregation for how this is used as a
    # weight when averaging EFF% across lines).
    shift_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)

    # Buyer/style the line is currently running - entered by Tổ trưởng each
    # submission (can change day to day on the same line), not a fixed Line
    # attribute. Always stored upper-case.
    buyer: Mapped[str | None] = mapped_column(Unicode(100), nullable=True)
    # SAM as entered by the Tổ trưởng on submit (pre-filled from the last
    # report). target_output/target_eff are a copy of the line's standing
    # target in force on this date (app.services.targets) - never entered by
    # the Tổ trưởng, and kept per row so past days keep the target they were
    # judged against. Nullable for rows created only by a lock/unlock.
    sam: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    target_output: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_eff: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    out_sew: Mapped[int | None] = mapped_column(Integer, nullable=True)
    eff_sew: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    out_fin_scanpack: Mapped[int | None] = mapped_column(Integer, nullable=True)
    out_fin_fin: Mapped[int | None] = mapped_column(Integer, nullable=True)
    eff_fin: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    # Work-in-progress stock at two separate stages, as the Tổ trưởng reports
    # them at end of shift. These replaced a single "WIP FIN" field, which the
    # factory confirmed measured something else entirely - its history was
    # exported to backup_wip_fin_truoc_khi_xoa.csv before removal rather than
    # being carried over, since the numbers are not comparable.
    wip_dip: Mapped[int | None] = mapped_column(Integer, nullable=True)
    wip_wash: Mapped[int | None] = mapped_column(Integer, nullable=True)
    wip_pre_pi: Mapped[int | None] = mapped_column(Integer, nullable=True)
    wip_post_pi: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Reason tags for the day's WIP (tồn), applying to the report as a whole
    # rather than to wip_dip/wip_pre_pi individually - a Tổ trưởng may check
    # any combination of these.
    wip_reason_machine: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    wip_reason_line_spread: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    wip_reason_semi_finished: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    wip_reason_quality: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
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


class LineTarget(Base):
    """A line's target (NEW OUT-TAR / NEW EFF-TAR) from effective_from onward,
    until the next row for the same line. Set by that line's Executive (or
    Thư ký/Manager), usually weekly; Tổ trưởng never see or set it. Each
    daily_reports row keeps a copy of the target in force on its date (see
    app.services.targets), so past reports keep the target they were judged
    against even after a later change."""

    __tablename__ = "line_targets"
    __table_args__ = (UniqueConstraint("line_id", "effective_from", name="uq_line_target_from"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    line_id: Mapped[int] = mapped_column(ForeignKey("lines.id"), nullable=False, index=True)
    effective_from: Mapped["Date"] = mapped_column(Date, nullable=False)
    target_output: Mapped[int] = mapped_column(Integer, nullable=False)
    target_eff: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    set_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    set_at: Mapped["DateTime"] = mapped_column(DateTime, server_default=func.now())

    set_by_user: Mapped["User | None"] = relationship(foreign_keys=[set_by])


class LoginFailure(Base):
    """One failed login attempt, kept only for app.login_throttle's sliding
    window. Stored in the database (not process memory) so every server
    worker enforces the same limit."""

    __tablename__ = "login_failures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    throttle_key: Mapped[str] = mapped_column(Unicode(200), nullable=False, index=True)
    failed_at: Mapped["DateTime"] = mapped_column(DateTime, nullable=False, index=True)


class ReportHistory(Base):
    """Audit trail for daily_reports changes - Thư ký/Sếp-only. Not linked by
    foreign key to daily_reports.id because a "Xóa & nhập lại" delete removes
    that row entirely; line_id/report_date are stored directly instead so the
    trail survives the row it describes. old_values/new_values are a JSON
    snapshot of every report field, taken before and after each action, so
    the full before/after picture is visible without needing to know in
    advance which fields a given action could touch."""

    __tablename__ = "report_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    line_id: Mapped[int] = mapped_column(ForeignKey("lines.id"), nullable=False, index=True)
    report_date: Mapped["Date"] = mapped_column(Date, nullable=False, index=True)
    action: Mapped[str] = mapped_column(Unicode(20), nullable=False)  # "submit" | "target_update" | "delete"
    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    changed_at: Mapped["DateTime"] = mapped_column(DateTime, server_default=func.now())
    old_values: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    new_values: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)

    line: Mapped["Line"] = relationship()
    changed_by_user: Mapped["User | None"] = relationship(foreign_keys=[changed_by])


class ProgressSource(Base):
    """One file the progress agent read on its last run: a person's "bảng tiến
    độ" tracker (kind="tracker") or the THV PRODUCTION PLAN file it looked up
    WF/Cust. Style from (kind="plan"). Kept so the page can say when each
    tracker was last read successfully - a tracker that failed to open keeps
    its previous rows instead of vanishing (see app.services.progress)."""

    __tablename__ = "progress_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    file_name: Mapped[str] = mapped_column(Unicode(255), unique=True, nullable=False)
    kind: Mapped[str] = mapped_column(Unicode(20), nullable=False, default="tracker")
    owner: Mapped[str] = mapped_column(Unicode(100), nullable=False)
    file_modified_at: Mapped["DateTime | None"] = mapped_column(DateTime, nullable=True)
    last_attempt_at: Mapped["DateTime"] = mapped_column(DateTime, nullable=False)
    last_ok_at: Mapped["DateTime | None"] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ProgressOrder(Base):
    """One running order row (Pack-cut khác 0) copied from a tracker by the
    progress agent. A tracker's rows are all replaced on every successful
    read, so nothing here is edited on the web - remarks and the "Đóng đơn"
    flag live in ProgressNote, keyed by order_key, and survive the daily
    replacement.

    Date columns are kept as text: usually an ISO date, but trackers also
    hold things like "Done" or "Not yet 4" that people rely on seeing."""

    __tablename__ = "progress_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_file: Mapped[str] = mapped_column(Unicode(255), nullable=False, index=True)
    order_key: Mapped[str] = mapped_column(Unicode(200), nullable=False, index=True)
    line_number: Mapped[str] = mapped_column(Unicode(20), nullable=False)
    line_raw: Mapped[str | None] = mapped_column(Unicode(50), nullable=True)
    buyer: Mapped[str | None] = mapped_column(Unicode(100), nullable=True)
    jo: Mapped[str] = mapped_column(Unicode(50), nullable=False)
    color: Mapped[str | None] = mapped_column(Unicode(100), nullable=True)
    bpo_date: Mapped[str | None] = mapped_column(Unicode(40), nullable=True)
    shipment_plan: Mapped[str | None] = mapped_column(Unicode(40), nullable=True)
    order_carton: Mapped[str | None] = mapped_column(Unicode(40), nullable=True)
    start_sew: Mapped[str | None] = mapped_column(Unicode(40), nullable=True)
    end_sew: Mapped[str | None] = mapped_column(Unicode(40), nullable=True)
    end_pack: Mapped[str | None] = mapped_column(Unicode(40), nullable=True)
    order_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    allocate_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cut_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sew_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pack_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pack_cut: Mapped[int] = mapped_column(Integer, nullable=False)
    product_category: Mapped[str | None] = mapped_column(Unicode(50), nullable=True)
    cust_style_no: Mapped[str | None] = mapped_column(Unicode(100), nullable=True)


class ProgressNote(Base):
    """What people add to an order on the web: EX/FIN REMARK. (is_closed /
    closed_by / closed_at belonged to a "Đóng đơn" button that was removed -
    the page now shows every running order; they are no longer read.)
    Keyed by ProgressOrder.order_key (line|JO|color) rather than a foreign
    key, because the order rows are rebuilt from the trackers every day."""

    __tablename__ = "progress_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_key: Mapped[str] = mapped_column(Unicode(200), unique=True, nullable=False)
    ex_remark: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    fin_remark: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    closed_by: Mapped[str | None] = mapped_column(Unicode(100), nullable=True)
    closed_at: Mapped["DateTime | None"] = mapped_column(DateTime, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(Unicode(100), nullable=True)
    updated_at: Mapped["DateTime"] = mapped_column(DateTime, nullable=False)
