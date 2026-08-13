import type {
  DailyReport,
  DailyReportInput,
  DashboardResponse,
  Line,
  LineWithReport,
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

  listUsers: (role?: UserRole) =>
    request<User[]>(`/api/users${role ? `?role=${role}` : ""}`),
  createUser: (payload: { username: string; password: string; full_name: string; role: UserRole }) =>
    request<User>("/api/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (id: number, payload: Partial<{ full_name: string; password: string; is_active: boolean }>) =>
    request<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  listLines: (includeInactive = false) =>
    request<Line[]>(`/api/lines${includeInactive ? "?include_inactive=true" : ""}`),
  createLine: (payload: Omit<Line, "id" | "to_truong_name">) =>
    request<Line>("/api/lines", { method: "POST", body: JSON.stringify(payload) }),
  updateLine: (id: number, payload: Partial<Omit<Line, "id" | "to_truong_name">>) =>
    request<Line>(`/api/lines/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deactivateLine: (id: number) => request<void>(`/api/lines/${id}`, { method: "DELETE" }),
  updateLineTargets: (id: number, payload: { sam: number; target_output: number; target_eff: number }) =>
    request<Line>(`/api/lines/${id}/targets`, { method: "PATCH", body: JSON.stringify(payload) }),

  myLines: (reportDate: string, shift: number) =>
    request<LineWithReport[]>(`/api/reports/my-lines?report_date=${reportDate}&shift=${shift}`),
  getLineReport: (lineId: number, reportDate: string, shift: number) =>
    request<LineWithReport>(`/api/reports/lines/${lineId}?report_date=${reportDate}&shift=${shift}`),
  submitReport: (lineId: number, reportDate: string, payload: DailyReportInput) =>
    request<DailyReport>(`/api/reports/lines/${lineId}?report_date=${reportDate}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  setLockByLine: (lineId: number, reportDate: string, shift: number, isLocked: boolean) =>
    request<DailyReport>(
      `/api/reports/lines/${lineId}/lock?report_date=${reportDate}&shift=${shift}`,
      { method: "PATCH", body: JSON.stringify({ is_locked: isLocked }) }
    ),
  setLockById: (reportId: number, isLocked: boolean) =>
    request<DailyReport>(`/api/reports/${reportId}/lock`, {
      method: "PATCH",
      body: JSON.stringify({ is_locked: isLocked }),
    }),

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
