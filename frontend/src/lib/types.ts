export type UserRole = "to_truong" | "thu_ky" | "sep" | "executive" | "finishing";
export type PuGroup = "PU1" | "PU2";

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  executive_name: string | null;
  is_active: boolean;
}

export interface Line {
  id: number;
  line_number: string;
  executive_name: string;
  pu_group: PuGroup;
  sam: number;
  target_output: number;
  target_eff: number;
  to_truong_user_id: number | null;
  to_truong_name: string | null;
  is_active: boolean;
  display_order: number;
}

export interface DailyReport {
  id: number;
  line_id: number;
  report_date: string;
  shift_count: number;
  buyer: string | null;
  sam: number | null;
  out_sew: number | null;
  eff_sew: number | null;
  out_fin_scanpack: number | null;
  out_fin_fin: number | null;
  eff_fin: number | null;
  wip_dip: number | null;
  wip_wash: number | null;
  wip_pre_pi: number | null;
  wip_post_pi: number | null;
  wip_reason_machine: boolean;
  wip_reason_line_spread: boolean;
  wip_reason_semi_finished: boolean;
  wip_reason_quality: boolean;
  issue_note: string | null;
  is_submitted: boolean;
  is_locked: boolean;
  submitted_at: string | null;
  var: number | null;
}

export interface EntryDefaults {
  buyer: string | null;
  shift_count: number;
  sam: number | null;
}

export interface LineWithReport {
  line: Line;
  report: DailyReport | null;
  is_editable: boolean;
  defaults: EntryDefaults | null;
}

export interface LineTargetRow {
  line_id: number;
  line_number: string;
  executive_name: string;
  pu_group: PuGroup;
  target_output: number | null;
  target_eff: number | null;
  effective_from: string | null;
  set_by_name: string | null;
  set_at: string | null;
}

export interface DailyReportInput {
  shift_count: number;
  buyer: string;
  sam: number | null;
  out_sew: number | null;
  eff_sew: number | null;
  out_fin_scanpack: number | null;
  out_fin_fin: number | null;
  eff_fin: number | null;
  wip_dip: number | null;
  wip_wash: number | null;
  wip_pre_pi: number | null;
  wip_post_pi: number | null;
  wip_reason_machine: boolean;
  wip_reason_line_spread: boolean;
  wip_reason_semi_finished: boolean;
  wip_reason_quality: boolean;
  issue_note: string | null;
}

export interface LineDaySummary {
  line_id: number;
  line_number: string;
  executive_name: string;
  pu_group: PuGroup;
  buyer: string | null;
  sam: number;
  target_output: number;
  target_eff: number;
  shift_display: string;
  shift_weight: number;
  eff_sew_weight: number;
  eff_fin_weight: number;
  out_sew: number | null;
  eff_sew: number | null;
  out_fin_scanpack: number | null;
  out_fin_fin: number | null;
  eff_fin: number | null;
  var: number | null;
  wip_dip: number | null;
  wip_wash: number | null;
  wip_pre_pi: number | null;
  wip_post_pi: number | null;
  wip_reason_machine: boolean;
  wip_reason_line_spread: boolean;
  wip_reason_semi_finished: boolean;
  wip_reason_quality: boolean;
  issue_note: string | null;
  is_submitted: boolean;
  is_locked: boolean;
}

export interface ExecutiveSummary {
  executive_name: string;
  pu_group: PuGroup;
  target_output: number;
  out_fin_fin: number;
  eff_fin_avg: number | null;
  eff_sew_avg: number | null;
  var: number;
}

export interface GroupSummary {
  label: string;
  level: "executive" | "pu" | "ttl";
  target_output: number;
  target_eff_avg: number | null;
  sam_avg: number | null;
  line_count: number;
  shift_total: number;
  out_sew: number;
  eff_sew_avg: number | null;
  out_fin_scanpack: number;
  out_fin_fin: number;
  eff_fin_avg: number | null;
  var: number;
  wip_dip: number;
  wip_wash: number;
  wip_pre_pi: number;
  wip_post_pi: number;
}

export interface KpiSummary {
  total_target_output: number;
  total_actual_output: number;
  completion_rate: number | null;
  avg_eff_sew: number | null;
  avg_eff_fin: number | null;
  total_wip_dip: number;
  total_wip_wash: number;
  total_wip_pre_pi: number;
  total_wip_post_pi: number;
  lines_with_issue: number;
  lines_submitted: number;
  lines_total: number;
}

export interface IssueItem {
  line_number: string;
  buyer: string | null;
  executive_name: string;
  issue_note: string;
}

export interface DashboardResponse {
  report_date: string;
  kpi: KpiSummary;
  lines: LineDaySummary[];
  executives: ExecutiveSummary[];
  summary_table: GroupSummary[];
  issues: IssueItem[];
}

export interface WeeklyDayPoint {
  report_date: string;
  target_output: number;
  actual_output: number;
  completion_rate: number | null;
  avg_eff_sew: number | null;
  avg_eff_fin: number | null;
  wip_dip: number;
  wip_wash: number;
  wip_pre_pi: number;
  wip_post_pi: number;
  lines_submitted: number;
}

export interface WeeklyLineSummary {
  line_id: number;
  line_number: string;
  executive_name: string;
  pu_group: PuGroup;
  days_submitted: number;
  shift_total: number;
  target_output: number;
  target_eff: number | null;
  out_sew: number;
  eff_sew: number | null;
  out_fin_scanpack: number;
  out_fin_fin: number;
  eff_fin: number | null;
  completion_rate: number | null;
  var: number;
  wip_dip: number | null;
  wip_wash: number | null;
  wip_pre_pi: number | null;
  wip_post_pi: number | null;
  wip_machine_days: number;
  wip_line_spread_days: number;
  wip_semi_finished_days: number;
  wip_quality_days: number;
  issue_days: number;
}

export interface WeeklyKpi {
  total_target_output: number;
  total_actual_output: number;
  completion_rate: number | null;
  avg_eff_sew: number | null;
  avg_eff_fin: number | null;
  end_wip_dip: number;
  end_wip_wash: number;
  end_wip_pre_pi: number;
  end_wip_post_pi: number;
  days_with_data: number;
  line_days_submitted: number;
  issue_line_days: number;
}

export interface WeeklyResponse {
  week_start: string;
  week_end: string;
  iso_week: number;
  kpi: WeeklyKpi;
  days: WeeklyDayPoint[];
  lines: WeeklyLineSummary[];
  summary_table: GroupSummary[];
  wip_reasons: { machine: number; line_spread: number; semi_finished: number; quality: number };
}

export type ReportHistoryAction = "submit" | "target_update" | "delete";

export interface ReportHistoryValues {
  shift_count: number | null;
  buyer: string | null;
  sam: number | null;
  target_output: number | null;
  target_eff: number | null;
  out_sew: number | null;
  eff_sew: number | null;
  out_fin_scanpack: number | null;
  out_fin_fin: number | null;
  eff_fin: number | null;
  wip_dip: number | null;
  wip_wash: number | null;
  wip_pre_pi: number | null;
  wip_post_pi: number | null;
  wip_reason_machine: boolean | null;
  wip_reason_line_spread: boolean | null;
  wip_reason_semi_finished: boolean | null;
  wip_reason_quality: boolean | null;
  issue_note: string | null;
}

export interface ReportHistoryEntry {
  id: number;
  action: ReportHistoryAction;
  changed_by_name: string | null;
  changed_at: string;
  old_values: ReportHistoryValues | null;
  new_values: ReportHistoryValues | null;
}

// ---------- Tiến độ đơn hàng ----------
export type ProgressQtyField = "order_qty" | "allocate_qty" | "cut_qty" | "sew_qty" | "pack_qty";

export interface ProgressEdit {
  original: number | null;
  set_by: string | null;
  set_at: string;
}

export interface ProgressOrder {
  order_key: string;
  line_number: string;
  executive_name: string | null;
  pu_group: PuGroup | null;
  source_owner: string;
  buyer: string | null;
  jo: string;
  color: string | null;
  cust_style_no: string | null;
  product_category: string | null;
  bpo_date: string | null;
  shipment_plan: string | null;
  order_carton: string | null;
  start_sew: string | null;
  end_sew: string | null;
  end_pack: string | null;
  order_qty: number | null;
  allocate_qty: number | null;
  cut_qty: number | null;
  sew_qty: number | null;
  pack_qty: number | null;
  pack_cut: number;
  /** Quantities a Manager corrected: field -> the tracker's own number. */
  edited: Partial<Record<ProgressQtyField, ProgressEdit>>;
  late: number | null;
  late_label: string | null;
  /** The computed value, and whether Finishing replaced it. */
  auto_late: number | null;
  late_manual: boolean;
  ex_remark: string | null;
  fin_remark: string | null;
  is_closed: boolean;
  closed_by: string | null;
  closed_at: string | null;
}

export interface ProgressSource {
  file_name: string;
  kind: "tracker" | "plan";
  owner: string;
  file_modified_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  row_count: number;
  ok_on_last_run: boolean;
}

export interface ProgressResponse {
  updated_at: string | null;
  closed_count: number;
  can_edit_numbers: boolean;
  /** Finishing only: change the Late column. */
  can_edit_late: boolean;
  sources: ProgressSource[];
  orders: ProgressOrder[];
}

export interface ProgressNoteUpdate {
  order_key: string;
  ex_remark?: string;
  fin_remark?: string;
  is_closed?: boolean;
  late?: number | null;
}

export interface ProgressNote {
  order_key: string;
  ex_remark: string | null;
  fin_remark: string | null;
  is_closed: boolean;
  closed_by: string | null;
  closed_at: string | null;
  late_override: number | null;
}

// ---------- Close order ----------
export interface CloseOrderWeek {
  week_start: string;
  week_end: string;
  published_at: string;
  imported: boolean;
  /** False = Thursday-morning draft, seen only by Finishing. */
  is_published: boolean;
  total: number;
  late: number;
}

export interface CloseOrderItem {
  id: number;
  line_number: string;
  executive_name: string | null;
  pu_group: PuGroup | null;
  buyer: string | null;
  jo: string;
  color_count: number | null;
  order_qty: number | null;
  cut_qty: number | null;
  sew_qty: number | null;
  pack_qty: number | null;
  pack_cut: number | null;
  bpo_date: string | null;
  exfty_date: string | null;
  end_sew: string;
  /** ISO date, "Done", or null while a colour is still unpacked. */
  end_pack: string | null;
  /** What the trackers say, shown beside a date Finishing corrected. */
  tracker_end_sew: string;
  tracker_end_pack: string | null;
  end_sew_manual: boolean;
  end_pack_manual: boolean;
  tracker_pack_cut: number | null;
  pack_cut_manual: boolean;
  /** Effective values: Finishing's when set by hand, else the formula's. */
  late_duration: number | null;
  is_late: boolean;
  auto_late_duration: number | null;
  auto_is_late: boolean;
  duration_manual: boolean;
  late_manual: boolean;
  /** "Tồn tuần trước": sewn before this week, still not End packed. */
  is_carry: boolean;
  is_removed: boolean;
  removed_by: string | null;
  removed_at: string | null;
  wf: boolean;
  wf_manual: boolean;
  product_category: string | null;
  remark: string | null;
  department: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

export interface CloseOrderWeekView {
  week_start: string;
  week_end: string;
  published_at: string;
  imported: boolean;
  /** False = Thursday-morning draft, seen only by Finishing. */
  is_published: boolean;
  source_errors: string[];
  can_edit: boolean;
  /** Finishing only: change Late duration / late-ontime and remove orders. */
  can_override: boolean;
  can_edit_holidays: boolean;
  departments: string[];
  items: CloseOrderItem[];
}

export interface Holiday {
  id: number;
  day: string;
  name: string | null;
}
