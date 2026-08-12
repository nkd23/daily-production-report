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
  buyer: string;
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
  out_sew: number | null;
  eff_sew: number | null;
  out_fin_scanpack: number | null;
  out_fin_fin: number | null;
  eff_fin: number | null;
  wip_fin: number | null;
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
  out_sew: number | null;
  eff_sew: number | null;
  out_fin_scanpack: number | null;
  out_fin_fin: number | null;
  eff_fin: number | null;
  wip_fin: number | null;
  issue_note: string | null;
}

export interface LineDaySummary {
  line_id: number;
  line_number: string;
  executive_name: string;
  pu_group: PuGroup;
  buyer: string;
  sam: number;
  target_output: number;
  target_eff: number;
  shift_display: string;
  out_sew: number | null;
  eff_sew: number | null;
  out_fin_scanpack: number | null;
  out_fin_fin: number | null;
  eff_fin: number | null;
  var: number | null;
  wip_fin: number | null;
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

export interface KpiSummary {
  total_target_output: number;
  total_actual_output: number;
  completion_rate: number | null;
  avg_eff_sew: number | null;
  avg_eff_fin: number | null;
  total_wip: number;
  lines_with_issue: number;
  lines_submitted: number;
  lines_total: number;
}

export interface IssueItem {
  line_number: string;
  buyer: string;
  executive_name: string;
  issue_note: string;
}

export interface DashboardResponse {
  report_date: string;
  kpi: KpiSummary;
  lines: LineDaySummary[];
  executives: ExecutiveSummary[];
  issues: IssueItem[];
}
