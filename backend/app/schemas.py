from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import PuGroup, UserRole


# ---------- Auth ----------
class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: str
    role: UserRole
    executive_name: str | None = None
    is_active: bool


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: UserRole
    executive_name: str | None = None


class UserUpdate(BaseModel):
    username: str | None = None
    full_name: str | None = None
    password: str | None = None
    executive_name: str | None = None
    is_active: bool | None = None


# ---------- Lines ----------
class LineBase(BaseModel):
    line_number: str
    executive_name: str
    pu_group: PuGroup
    sam: float
    target_output: int
    target_eff: float
    to_truong_user_id: int | None = None
    is_active: bool = True
    display_order: int = 0


class LineCreate(LineBase):
    pass


class LineUpdate(BaseModel):
    line_number: str | None = None
    executive_name: str | None = None
    pu_group: PuGroup | None = None
    sam: float | None = None
    target_output: int | None = None
    target_eff: float | None = None
    to_truong_user_id: int | None = None
    is_active: bool | None = None
    display_order: int | None = None


class LineOut(LineBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    to_truong_name: str | None = None


class LineTargetSet(BaseModel):
    """A line's target from effective_from onward - set by its Executive or
    Thư ký/Manager (see app.services.targets)."""

    target_output: int = Field(gt=0)
    target_eff: float = Field(gt=0, le=200)
    effective_from: date


class LineTargetRow(BaseModel):
    line_id: int
    line_number: str
    executive_name: str
    pu_group: PuGroup
    target_output: int | None
    target_eff: float | None
    # None = no target saved on the Target page yet; the values above then
    # come from the line's latest report.
    effective_from: date | None
    set_by_name: str | None
    set_at: datetime | None


# ---------- Daily reports ----------
class DailyReportInput(BaseModel):
    shift_count: int = Field(ge=1, le=2)
    buyer: str = Field(min_length=1)
    sam: float = Field(gt=0)
    out_sew: int | None = Field(default=None, ge=0)
    eff_sew: float | None = Field(default=None, ge=0)
    out_fin_scanpack: int | None = Field(default=None, ge=0)
    out_fin_fin: int | None = Field(default=None, ge=0)
    eff_fin: float | None = Field(default=None, ge=0)
    wip_dip: int | None = Field(default=None, ge=0)
    wip_wash: int | None = Field(default=None, ge=0)
    wip_pre_pi: int | None = Field(default=None, ge=0)
    wip_post_pi: int | None = Field(default=None, ge=0)
    wip_reason_machine: bool = False
    wip_reason_line_spread: bool = False
    wip_reason_semi_finished: bool = False
    wip_reason_quality: bool = False
    issue_note: str | None = None

    @field_validator("buyer")
    @classmethod
    def uppercase_buyer(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError("Buyer không được để trống")
        return v


class DailyReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    line_id: int
    report_date: date
    shift_count: int
    buyer: str | None
    sam: float | None
    out_sew: int | None
    eff_sew: float | None
    out_fin_scanpack: int | None
    out_fin_fin: int | None
    eff_fin: float | None
    wip_dip: int | None
    wip_wash: int | None
    wip_pre_pi: int | None
    wip_post_pi: int | None
    wip_reason_machine: bool
    wip_reason_line_spread: bool
    wip_reason_semi_finished: bool
    wip_reason_quality: bool
    issue_note: str | None
    is_submitted: bool
    is_locked: bool
    submitted_at: datetime | None
    var: int | None = None


class EntryDefaults(BaseModel):
    """Pre-fill for a day with no report yet, from the line's latest submission."""

    buyer: str | None
    shift_count: int
    sam: float | None


class LineWithReportOut(BaseModel):
    line: LineOut
    report: DailyReportOut | None
    is_editable: bool
    defaults: EntryDefaults | None = None


class UnlockRequest(BaseModel):
    is_locked: bool


class ReportHistoryOut(BaseModel):
    id: int
    action: str  # "submit" | "target_update" | "delete"
    changed_by_name: str | None
    changed_at: datetime
    old_values: dict | None
    new_values: dict | None


# ---------- Aggregated / dashboard ----------
class LineDaySummary(BaseModel):
    line_id: int
    line_number: str
    executive_name: str
    pu_group: PuGroup
    buyer: str | None
    sam: float
    target_output: int
    target_eff: float
    shift_display: str
    # How many shifts this line ran today (1 or 2) - the factory's "Shift/Ca"
    # column. Used as the weight when averaging EFF%/target-EFF across lines,
    # matching the original spreadsheet: SUMPRODUCT(Shift, EFF%) / SUM(Shift).
    shift_weight: int
    # Same count, but only over the shifts that actually reported that metric.
    # A line that ran 2 shifts but only logged EFF-FIN for one of them must
    # weigh 1, not 2 - the original sheet drops such lines from the divisor
    # too (its subtotals divide by 11/21/53 instead of 13/23/55).
    eff_sew_weight: int
    eff_fin_weight: int
    out_sew: int | None
    eff_sew: float | None
    out_fin_scanpack: int | None
    out_fin_fin: int | None
    eff_fin: float | None
    var: int | None
    wip_dip: int | None
    wip_wash: int | None
    wip_pre_pi: int | None
    wip_post_pi: int | None
    wip_reason_machine: bool
    wip_reason_line_spread: bool
    wip_reason_semi_finished: bool
    wip_reason_quality: bool
    issue_note: str | None
    is_submitted: bool
    is_locked: bool


class ExecutiveSummary(BaseModel):
    executive_name: str
    pu_group: PuGroup
    target_output: int
    out_fin_fin: int
    eff_fin_avg: float | None
    eff_sew_avg: float | None
    var: int


class GroupSummary(BaseModel):
    """One row of the Executive / PU / TTL summary table - mirrors the
    subtotal rows in the original Excel report layout."""

    label: str
    level: str  # "executive" | "pu" | "ttl"
    target_output: int
    target_eff_avg: float | None
    sam_avg: float | None
    line_count: int
    shift_total: int  # total shifts run by the group, the sheet's Shift/Ca subtotal
    out_sew: int
    eff_sew_avg: float | None
    out_fin_scanpack: int
    out_fin_fin: int
    eff_fin_avg: float | None
    var: int
    wip_dip: int
    wip_wash: int
    wip_pre_pi: int
    wip_post_pi: int


class KpiSummary(BaseModel):
    total_target_output: int
    total_actual_output: int
    completion_rate: float | None
    avg_eff_sew: float | None
    avg_eff_fin: float | None
    total_wip_dip: int
    total_wip_wash: int
    total_wip_pre_pi: int
    total_wip_post_pi: int
    lines_with_issue: int
    lines_submitted: int
    lines_total: int


class IssueItem(BaseModel):
    line_number: str
    buyer: str | None
    executive_name: str
    issue_note: str


class DashboardResponse(BaseModel):
    report_date: date
    kpi: KpiSummary
    lines: list[LineDaySummary]
    executives: list[ExecutiveSummary]
    summary_table: list[GroupSummary]
    issues: list[IssueItem]


# ---------- Weekly (Monday -> Sunday) ----------
class WeeklyDayPoint(BaseModel):
    report_date: date
    target_output: int
    actual_output: int
    completion_rate: float | None
    avg_eff_sew: float | None
    avg_eff_fin: float | None
    wip_dip: int
    wip_wash: int
    wip_pre_pi: int
    wip_post_pi: int
    lines_submitted: int


class WeeklyLineSummary(BaseModel):
    line_id: int
    line_number: str
    executive_name: str
    pu_group: PuGroup
    days_submitted: int
    shift_total: int
    target_output: int
    target_eff: float | None
    out_sew: int
    eff_sew: float | None
    out_fin_scanpack: int
    out_fin_fin: int
    eff_fin: float | None
    completion_rate: float | None
    var: int
    # Stock on hand as of the line's last submitted day in the week - WIP is a
    # point-in-time count, so summing it across days would be meaningless.
    wip_dip: int | None
    wip_wash: int | None
    wip_pre_pi: int | None
    wip_post_pi: int | None
    # Number of days in the week each reason was checked.
    wip_machine_days: int
    wip_line_spread_days: int
    wip_semi_finished_days: int
    wip_quality_days: int
    issue_days: int


class WeeklyKpi(BaseModel):
    total_target_output: int
    total_actual_output: int
    completion_rate: float | None
    avg_eff_sew: float | None
    avg_eff_fin: float | None
    end_wip_dip: int
    end_wip_wash: int
    end_wip_pre_pi: int
    end_wip_post_pi: int
    days_with_data: int
    line_days_submitted: int
    issue_line_days: int


class WeeklyWipReasonTotals(BaseModel):
    """Line-days per reason: one line checking a reason on one day = 1."""

    machine: int
    line_spread: int
    semi_finished: int
    quality: int


class WeeklyResponse(BaseModel):
    week_start: date
    week_end: date
    iso_week: int
    kpi: WeeklyKpi
    days: list[WeeklyDayPoint]
    lines: list[WeeklyLineSummary]
    summary_table: list[GroupSummary]
    wip_reasons: WeeklyWipReasonTotals


# ---------- Tiến độ đơn hàng (progress trackers) ----------
class ProgressRowIn(BaseModel):
    """One tracker row as the agent read it. Dates arrive as ISO text, other
    cell text as-is; the server cleans and truncates (app.services.progress)
    rather than rejecting a whole morning's upload over one odd cell."""

    line: str | None = None
    buyer: str | None = None
    jo: str | None = None
    color: str | None = None
    bpo_date: str | None = None
    shipment_plan: str | None = None
    order_carton: str | None = None
    start_sew: str | None = None
    end_sew: str | None = None
    end_pack: str | None = None
    order_qty: float | None = None
    allocate_qty: float | None = None
    cut_qty: float | None = None
    sew_qty: float | None = None
    pack_qty: float | None = None
    pack_cut: float | None = None
    product_category: str | None = None
    cust_style_no: str | None = None


class ProgressSourceIn(BaseModel):
    file_name: str = Field(min_length=1)
    modified_at: datetime | None = None
    error: str | None = None
    rows: list[ProgressRowIn] = Field(default_factory=list, max_length=20000)


class ProgressIngest(BaseModel):
    agent_version: str | None = None
    plan_file: str | None = None
    plan_modified_at: datetime | None = None
    plan_error: str | None = None
    plan_jo_count: int = 0
    sources: list[ProgressSourceIn] = Field(max_length=200)


class ProgressNoteUpdate(BaseModel):
    """Only the fields sent are changed."""

    order_key: str = Field(min_length=1, max_length=200)
    ex_remark: str | None = Field(default=None, max_length=1000)
    fin_remark: str | None = Field(default=None, max_length=1000)


class ProgressNoteOut(BaseModel):
    order_key: str
    ex_remark: str | None
    fin_remark: str | None


class ProgressOrderOut(BaseModel):
    order_key: str
    line_number: str
    executive_name: str | None
    pu_group: str | None
    source_owner: str
    buyer: str | None
    jo: str
    color: str | None
    cust_style_no: str | None
    product_category: str | None
    bpo_date: str | None
    shipment_plan: str | None
    order_carton: str | None
    start_sew: str | None
    end_sew: str | None
    end_pack: str | None
    order_qty: int | None
    allocate_qty: int | None
    cut_qty: int | None
    sew_qty: int | None
    pack_qty: int | None
    pack_cut: int
    late: int | None
    late_label: str | None
    ex_remark: str | None
    fin_remark: str | None


class ProgressSourceOut(BaseModel):
    file_name: str
    kind: str
    owner: str
    file_modified_at: datetime | None
    last_ok_at: datetime | None
    last_error: str | None
    row_count: int
    ok_on_last_run: bool


class ProgressResponse(BaseModel):
    updated_at: datetime | None
    sources: list[ProgressSourceOut]
    orders: list[ProgressOrderOut]
