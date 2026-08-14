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
    is_active: bool


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: UserRole


class UserUpdate(BaseModel):
    full_name: str | None = None
    password: str | None = None
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


class LineTargetUpdate(BaseModel):
    """SAM / NEW OUT-TAR / NEW EFF-TAR for one day's report - these can change
    day to day (SAM tracks whatever buyer/style is currently running), entered
    by whoever knows the current numbers (Thư ký, Sếp, or the Tổ trưởng of
    that line)."""

    sam: float = Field(gt=0)
    target_output: int = Field(gt=0)
    target_eff: float = Field(gt=0)


# ---------- Daily reports ----------
class DailyReportInput(BaseModel):
    shift: int = Field(ge=1, le=2)
    buyer: str = Field(min_length=1)
    out_sew: int | None = Field(default=None, ge=0)
    eff_sew: float | None = Field(default=None, ge=0)
    out_fin_scanpack: int | None = Field(default=None, ge=0)
    out_fin_fin: int | None = Field(default=None, ge=0)
    eff_fin: float | None = Field(default=None, ge=0)
    wip_fin: int | None = Field(default=None, ge=0)
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
    shift: int
    buyer: str | None
    out_sew: int | None
    eff_sew: float | None
    out_fin_scanpack: int | None
    out_fin_fin: int | None
    eff_fin: float | None
    wip_fin: int | None
    issue_note: str | None
    is_submitted: bool
    is_locked: bool
    submitted_at: datetime | None
    var: int | None = None


class LineWithReportOut(BaseModel):
    line: LineOut
    report: DailyReportOut | None
    is_editable: bool


class UnlockRequest(BaseModel):
    is_locked: bool


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
    wip_fin: int | None
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
    wip_fin: int


class KpiSummary(BaseModel):
    total_target_output: int
    total_actual_output: int
    completion_rate: float | None
    avg_eff_sew: float | None
    avg_eff_fin: float | None
    total_wip: int
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
