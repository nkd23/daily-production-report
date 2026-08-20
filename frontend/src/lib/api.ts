import type {
  DailyReport,
  DailyReportInput,
  DashboardResponse,
  Line,
  LineWithReport,
  ReportHistoryEntry,
  User,
  UserRole,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "duy1_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail ?? detail;
    } catch {
      // ignore body parse failure
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ access_token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<User>("/api/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<User>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),

  listUsers: (role?: UserRole) =>
    request<User[]>(`/api/users${role ? `?role=${role}` : ""}`),
  createUser: (payload: { username: string; password: string; full_name: string; role: UserRole; executive_name?: string | null }) =>
    request<User>("/api/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (
    id: number,
    payload: Partial<{ username: string; full_name: string; password: string; executive_name: string; is_active: boolean }>
  ) =>
    request<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteUser: (id: number) => request<void>(`/api/users/${id}`, { method: "DELETE" }),

  listLines: (includeInactive = false) =>
    request<Line[]>(`/api/lines${includeInactive ? "?include_inactive=true" : ""}`),
  createLine: (payload: Omit<Line, "id" | "to_truong_name">) =>
    request<Line>("/api/lines", { method: "POST", body: JSON.stringify(payload) }),
  updateLine: (id: number, payload: Partial<Omit<Line, "id" | "to_truong_name">>) =>
    request<Line>(`/api/lines/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deactivateLine: (id: number) => request<void>(`/api/lines/${id}`, { method: "DELETE" }),
  deleteLinePermanently: (id: number) => request<void>(`/api/lines/${id}/hard`, { method: "DELETE" }),

  myLines: (reportDate: string) =>
    request<LineWithReport[]>(`/api/reports/my-lines?report_date=${reportDate}`),
  getLineReport: (lineId: number, reportDate: string) =>
    request<LineWithReport>(`/api/reports/lines/${lineId}?report_date=${reportDate}`),
  submitReport: (lineId: number, reportDate: string, payload: DailyReportInput) =>
    request<DailyReport>(`/api/reports/lines/${lineId}?report_date=${reportDate}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateLineTargets: (
    lineId: number,
    reportDate: string,
    payload: { sam: number; target_output: number; target_eff: number }
  ) =>
    request<Line>(`/api/reports/lines/${lineId}/targets?report_date=${reportDate}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  setLockByLine: (lineId: number, reportDate: string, isLocked: boolean) =>
    request<DailyReport>(
      `/api/reports/lines/${lineId}/lock?report_date=${reportDate}`,
      { method: "PATCH", body: JSON.stringify({ is_locked: isLocked }) }
    ),
  setLockById: (reportId: number, isLocked: boolean) =>
    request<DailyReport>(`/api/reports/${reportId}/lock`, {
      method: "PATCH",
      body: JSON.stringify({ is_locked: isLocked }),
    }),
  deleteReport: (lineId: number, reportDate: string) =>
    request<void>(`/api/reports/lines/${lineId}?report_date=${reportDate}`, { method: "DELETE" }),
  getReportHistory: (lineId: number, reportDate: string) =>
    request<ReportHistoryEntry[]>(`/api/reports/lines/${lineId}/history?report_date=${reportDate}`),
  getRecentReports: (lineId: number, limit = 30) =>
    request<DailyReport[]>(`/api/reports/lines/${lineId}/recent?limit=${limit}`),

  dashboardSummary: (reportDate: string) =>
    request<DashboardResponse>(`/api/dashboard/summary?report_date=${reportDate}`),

  async downloadExcel(reportDate: string) {
    const token = getToken();
    const res = await fetch(`${API_URL}/api/export/excel?report_date=${reportDate}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, "Không xuất được file Excel");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BaoCaoSanLuong_${reportDate.replace(/-/g, "")}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};

export { API_URL };
