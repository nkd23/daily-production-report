export type UserRole = "to_truong" | "thu_ky" | "sep";
export type PuGroup = "PU1" | "PU2";

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
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
  shift: number;
  buyer: string | null;
  out_sew: number | null;
  eff_sew: number | null;
  out_fin_scanpack: number | null;
  out_fin_fin: number | null;
  eff_fin: number | null;
  wip_dip: number | null;
  wip_pre_pi: number | null;
  issue_note: string | null;
  is_submitted: boolean;
  is_locked: boolean;
  submitted_at: string | null;
  var: number | null;
}

export interface LineWithReport {
  line: Line;
  report: DailyReport | null;
  is_editable: boolean;
}

export interface DailyReportInput {
  shift: number;
  buyer: string;
  out_sew: number | null;
  eff_sew: number | null;
  out_fin_scanpack: number | null;
  out_fin_fin: number | null;
  eff_fin: number | null;
  wip_dip: number | null;
  wip_pre_pi: number | null;
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
  wip_pre_pi: number | null;
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
  wip_pre_pi: number;
}

export interface KpiSummary {
  total_target_output: number;
  total_actual_output: number;
  completion_rate: number | null;
  avg_eff_sew: number | null;
  avg_eff_fin: number | null;
  total_wip_dip: number;
  total_wip_pre_pi: number;
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

export type ReportHistoryAction = "submit" | "target_update" | "delete";

export interface ReportHistoryValues {
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
  wip_pre_pi: number | null;
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
