"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Gauge,
  LayoutDashboard,
  PackageCheck,
  RefreshCw,
  Scissors,
  Target,
} from "lucide-react";
import { RequireRole } from "@/components/RequireRole";
import { PageShell } from "@/components/PageShell";
import { Badge, Button, Card, Input, StatCard } from "@/components/ui";
import { EffPanel } from "@/components/EffDashboard";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { effClass } from "@/lib/eff-thresholds";
import { execColor } from "@/lib/exec-colors";
import { useSharedReportDate } from "@/lib/report-date-context";
import { wipExceedsOutClass } from "@/lib/wip-alert";
import type { DashboardResponse } from "@/lib/types";

type Tab = "overview" | "eff-sew" | "eff-fin";

// EFF-SEW tab tạm thời ẩn khỏi thanh tab theo yêu cầu - target hiệu suất
// SEW giờ chỉ có ý nghĩa để so sánh trong tab EFF-FIN, không cần 1 tab riêng.
// "eff-sew" vẫn còn trong type Tab/logic render bên dưới nên chỉ cần thêm
// lại dòng entry này vào TABS là bật lại được ngay.
const TABS: { key: Tab; label: string; title: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "Tổng quan", title: "Dashboard sản lượng", icon: LayoutDashboard },
  { key: "eff-fin", label: "EFF-FIN", title: "Dashboard EFF-FIN", icon: PackageCheck },
];

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("sv-SE");
}

function formatVietnameseDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmt(n: number | null | undefined, suffix = "") {
  if (n === null || n === undefined) return "-";
  return `${n.toLocaleString("vi-VN")}${suffix}`;
}

// Only the Executive subtotal rows get color-coded here - PU/TTL rows are
// aggregates of aggregates and not meaningful against a single target_eff.
function effCellClass(actual: number | null, target: number | null, level: string) {
  return level !== "executive" ? "" : effClass(actual, target);
}

interface LineChartRow {
  name: string;
  executive: string;
  Target: number;
  "Thực tế": number;
}

function LineChartTooltip({ active, label, payload }: { active?: boolean; label?: string; payload?: { payload: LineChartRow }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const colors = execColor(row.executive);
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm shadow-lg">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="mb-2 text-xs text-muted">{row.executive}</p>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.light }} />
        <span className="text-muted">Target:</span>
        <span className="font-medium text-foreground">{row.Target.toLocaleString("vi-VN")}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.solid }} />
        <span className="text-muted">Thực tế:</span>
        <span className="font-medium text-foreground">{row["Thực tế"].toLocaleString("vi-VN")}</span>
      </div>
    </div>
  );
}

interface ExecChartRow {
  name: string;
  executive: string;
  Target: number;
  "Thực tế": number;
}

function ExecChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ExecChartRow }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const colors = execColor(row.executive);
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm shadow-lg">
      <p className="mb-2 font-semibold text-foreground">{row.name}</p>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.light }} />
        <span className="text-muted">Target:</span>
        <span className="font-medium text-foreground">{row.Target.toLocaleString("vi-VN")}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.solid }} />
        <span className="text-muted">Thực tế:</span>
        <span className="font-medium text-foreground">{row["Thực tế"].toLocaleString("vi-VN")}</span>
      </div>
    </div>
  );
}

interface PieChartRow {
  name: string;
  value: number;
}

function DashboardContent() {
  const { user } = useAuth();
  // Excel export is a whole-company report - the backend only allows
  // thu_ky/sep to call it, so an Executive account (scoped to one person's
  // lines) never sees a button that would just 403.
  const canExport = user?.role !== "executive";
  const [reportDate, setReportDate] = useSharedReportDate(yesterdayISO());
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const activeTab = TABS.find((t) => t.key === tab)!;

  const load = useCallback(() => {
    setLoading(true);
    api
      .dashboardSummary(reportDate)
      .then(setData)
      .finally(() => setLoading(false));
  }, [reportDate]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      await api.downloadExcel(reportDate);
    } finally {
      setExporting(false);
    }
  }

  const lineChartData =
    data?.lines
      .filter((l) => l.is_submitted)
      .map((l) => ({
        name: l.line_number,
        executive: l.executive_name,
        Target: l.target_output,
        "Thực tế": l.out_fin_fin ?? 0,
      })) ?? [];
  const lineChartExecs = [...new Set(lineChartData.map((d) => d.executive))];

  const execChartData =
    data?.executives
      .filter((e) => e.target_output > 0 || e.out_fin_fin > 0)
      .map((e) => ({
        name: `${e.executive_name} (${e.pu_group})`,
        executive: e.executive_name,
        Target: e.target_output,
        "Thực tế": e.out_fin_fin,
      })) ?? [];

  const pieDataMap = new Map<string, number>();
  (data?.executives ?? []).forEach((e) => {
    if (e.out_fin_fin > 0) {
      pieDataMap.set(e.executive_name, (pieDataMap.get(e.executive_name) ?? 0) + e.out_fin_fin);
    }
  });
  const pieData: PieChartRow[] = [...pieDataMap.entries()].map(([name, value]) => ({ name, value }));

  const wipReasonLines = (data?.lines ?? []).filter(
    (l) => l.wip_reason_machine || l.wip_reason_line_spread || l.wip_reason_semi_finished
  );
  const wipReasonCounts = [
    { name: "Do máy", value: (data?.lines ?? []).filter((l) => l.wip_reason_machine).length, color: "var(--warning)" },
    { name: "Rải chuyền", value: (data?.lines ?? []).filter((l) => l.wip_reason_line_spread).length, color: "var(--primary)" },
    { name: "Bán thành phẩm", value: (data?.lines ?? []).filter((l) => l.wip_reason_semi_finished).length, color: "var(--pu2)" },
  ];

  return (
    <PageShell
      title={activeTab.title}
      description={formatVietnameseDate(reportDate)}
      actions={
        <>
          <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-auto" />
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw size={14} /> Làm mới
          </Button>
          {canExport ? (
            <Button size="sm" disabled={exporting} onClick={handleExport}>
              <Download size={14} /> {exporting ? "Đang xuất..." : "Xuất Excel"}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="mb-6 inline-flex items-center gap-1 rounded-xl border border-border bg-surface-muted p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading || !data ? (
        <p className="text-sm text-muted">Đang tải...</p>
      ) : tab === "eff-sew" ? (
        <EffPanel metric="sew" data={data} />
      ) : tab === "eff-fin" ? (
        <EffPanel metric="fin" data={data} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Target Output" value={fmt(data.kpi.total_target_output)} icon={Target} />
            <StatCard
              label="Actual Output"
              value={fmt(data.kpi.total_actual_output)}
              tone={data.kpi.total_actual_output >= data.kpi.total_target_output ? "success" : "danger"}
              icon={PackageCheck}
            />
            <StatCard
              label="% Hoàn thành"
              value={data.kpi.completion_rate !== null ? `${data.kpi.completion_rate}%` : "-"}
              tone={
                data.kpi.completion_rate !== null && data.kpi.completion_rate >= 100
                  ? "success"
                  : data.kpi.completion_rate !== null && data.kpi.completion_rate < 75
                    ? "danger"
                    : "warning"
              }
              icon={CheckCircle2}
            />
            <StatCard label="EFF SEW TB" value={data.kpi.avg_eff_sew !== null ? `${data.kpi.avg_eff_sew}%` : "-"} tone="primary" icon={Gauge} />
            <StatCard label="EFF FIN TB" value={data.kpi.avg_eff_fin !== null ? `${data.kpi.avg_eff_fin}%` : "-"} tone="primary" icon={Gauge} />
            <StatCard
              label="Line có Issue"
              value={String(data.kpi.lines_with_issue)}
              sub={`${data.kpi.lines_submitted}/${data.kpi.lines_total} line đã nộp`}
              tone={data.kpi.lines_with_issue > 0 ? "warning" : "success"}
              icon={AlertTriangle}
            />
          </div>

          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">Output theo Line (Target vs Thực tế)</h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {lineChartExecs.map((exec) => (
                  <span key={exec} className="flex items-center gap-1.5 text-xs text-muted">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: execColor(exec).solid }}
                    />
                    {exec}
                  </span>
                ))}
              </div>
            </div>
            {lineChartData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">Chưa có line nào nộp báo cáo ngày này.</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={lineChartData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<LineChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="Target" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                    {lineChartData.map((entry, idx) => (
                      <Cell key={idx} fill={execColor(entry.executive).light} />
                    ))}
                  </Bar>
                  <Bar dataKey="Thực tế" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                    {lineChartData.map((entry, idx) => (
                      <Cell key={idx} fill={execColor(entry.executive).solid} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Tổng hợp theo Executive / PU</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={execChartData} layout="vertical" margin={{ left: 40 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={140} />
                <Tooltip content={<ExecChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="Target" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                  {execChartData.map((entry, idx) => (
                    <Cell key={idx} fill={execColor(entry.executive).light} />
                  ))}
                </Bar>
                <Bar dataKey="Thực tế" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                  {execChartData.map((entry, idx) => (
                    <Cell key={idx} fill={execColor(entry.executive).solid} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <PackageCheck size={16} className="text-warning" /> Lý do tồn
            </h2>
            {wipReasonLines.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Không có line nào ghi nhận lý do tồn ngày này.</p>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <ResponsiveContainer width="100%" height={360}>
                  <PieChart>
                    <Pie
                      data={wipReasonCounts.filter((r) => r.value > 0)}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={130}
                      isAnimationActive={false}
                      label={(entry: { value?: number }) => entry.value}
                      labelLine={false}
                    >
                      {wipReasonCounts
                        .filter((r) => r.value > 0)
                        .map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} line`, "Số line"]} />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                        <th className="py-2 pr-3 font-medium">Line</th>
                        <th className="py-2 pr-3 font-medium">Executive</th>
                        <th className="py-2 pr-3 font-medium">Lý do</th>
                        <th className="py-2 font-medium">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wipReasonLines.map((l) => (
                        <tr key={l.line_id} className="border-b border-border last:border-0">
                          <td className="py-2 pr-3 font-medium">{l.line_number}</td>
                          <td className="py-2 pr-3 text-muted">{l.executive_name}</td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap gap-1">
                              {l.wip_reason_machine ? <Badge tone="warning">Do máy</Badge> : null}
                              {l.wip_reason_line_spread ? <Badge tone="primary">Rải chuyền</Badge> : null}
                              {l.wip_reason_semi_finished ? <Badge tone="pu2">Bán thành phẩm</Badge> : null}
                            </div>
                          </td>
                          <td className="py-2 text-muted">{l.issue_note || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Tỷ trọng Output thực tế theo Executive</h2>
            {pieData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">Chưa có line nào nộp báo cáo ngày này.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex h-6 w-full overflow-hidden rounded-full bg-surface-muted">
                  {pieData.map((entry, idx) => (
                    <div
                      key={idx}
                      title={`${entry.name}: ${entry.value.toLocaleString("vi-VN")}`}
                      style={{
                        width: `${(entry.value / pieData.reduce((sum, x) => sum + x.value, 0)) * 100}%`,
                        backgroundColor: execColor(entry.name).solid,
                      }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                  {pieData.map((entry) => (
                    <span key={entry.name} className="flex items-center gap-1.5 text-xs text-muted">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: execColor(entry.name).solid }}
                      />
                      {entry.name}:{" "}
                      <span className="font-medium text-foreground">
                        {Math.round((entry.value / pieData.reduce((sum, x) => sum + x.value, 0)) * 100)}%
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <h2 className="px-5 pt-5 text-sm font-semibold text-foreground">
              Bảng tổng hợp Executive / PU / TTL
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-2 font-medium">Executive / PU</th>
                    <th className="px-4 py-2 text-right font-medium">Target OUT</th>
                    <th className="px-4 py-2 text-right font-medium">Target EFF</th>
                    <th className="px-4 py-2 text-right font-medium">SAM</th>
                    <th className="px-4 py-2 text-right font-medium">Số ca</th>
                    <th className="px-4 py-2 text-right font-medium">OUT-SEW</th>
                    <th className="px-4 py-2 text-right font-medium">EFF-SEW</th>
                    <th className="px-4 py-2 text-right font-medium">OUT-FIN (Scan)</th>
                    <th className="px-4 py-2 text-right font-medium">OUT-FIN (Fin)</th>
                    <th className="px-4 py-2 text-right font-medium">EFF-FIN</th>
                    <th className="px-4 py-2 text-right font-medium">VAR</th>
                    <th className="px-4 py-2 text-right font-medium">Tồn Dip</th>
                    <th className="px-4 py-2 text-right font-medium">Tồn trước PI</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.summary_table ?? []).map((row, idx) => {
                    // On the TTL row (already bg-primary) the danger tint
                    // would be invisible - fall back to a bold underline so
                    // it still reads as a flag.
                    const wipAlert = wipExceedsOutClass(row.wip_pre_pi, row.out_fin_fin);
                    const wipCellCls =
                      row.level === "ttl" && wipAlert ? "underline decoration-2 underline-offset-2 font-bold" : wipAlert;
                    return (
                    <tr
                      key={idx}
                      className={
                        row.level === "ttl"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : row.level === "pu"
                            ? "border-b border-border bg-surface-muted font-semibold"
                            : "border-b border-border"
                      }
                    >
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2">
                          {row.level === "executive" ? (
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: execColor(row.label).solid }}
                            />
                          ) : null}
                          {row.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">{row.target_output ? row.target_output.toLocaleString("vi-VN") : "-"}</td>
                      <td className="px-4 py-2 text-right">{row.target_eff_avg !== null ? `${row.target_eff_avg}%` : "-"}</td>
                      <td className="px-4 py-2 text-right">{row.sam_avg ?? "-"}</td>
                      <td className="px-4 py-2 text-right">{row.shift_total || "-"}</td>
                      <td className="px-4 py-2 text-right">{row.out_sew.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-2 text-right">
                        {row.eff_sew_avg !== null ? `${row.eff_sew_avg}%` : "-"}
                      </td>
                      <td className="px-4 py-2 text-right">{row.out_fin_scanpack.toLocaleString("vi-VN")}</td>
                      <td className={`px-4 py-2 text-right ${wipCellCls}`}>{row.out_fin_fin.toLocaleString("vi-VN")}</td>
                      <td className={`px-4 py-2 text-right ${effCellClass(row.eff_fin_avg, row.target_eff_avg, row.level)}`}>
                        {row.eff_fin_avg !== null ? `${row.eff_fin_avg}%` : "-"}
                      </td>
                      <td className={`px-4 py-2 text-right ${row.var < 0 && row.level === "executive" ? "text-danger font-semibold" : ""}`}>
                        {row.var.toLocaleString("vi-VN")}
                      </td>
                      <td className="px-4 py-2 text-right">{row.wip_dip.toLocaleString("vi-VN")}</td>
                      <td
                        className={`px-4 py-2 text-right ${wipCellCls}`}
                        title={wipAlert ? "Tồn trước PI đang nhiều hơn OUT-FIN (Fin)" : undefined}
                      >
                        {row.wip_pre_pi.toLocaleString("vi-VN")}
                      </td>
                    </tr>
                    );
                  })}
                  {!data.summary_table || data.summary_table.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-4 py-8 text-center text-sm text-muted">
                        Chưa có line nào nộp báo cáo ngày này.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <h2 className="px-5 pt-5 text-sm font-semibold text-foreground">Trạng thái nộp báo cáo</h2>
            <div className="mt-3 max-h-[360px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-2 font-medium">Line</th>
                    <th className="px-5 py-2 font-medium">Executive</th>
                    <th className="px-5 py-2 font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={l.line_id} className="border-b border-border last:border-0">
                      <td className="px-5 py-2 font-medium">{l.line_number}</td>
                      <td className="px-5 py-2 text-muted">{l.executive_name}</td>
                      <td className="px-5 py-2">
                        {l.is_submitted ? <Badge tone="success">Đã nộp</Badge> : <Badge tone="warning">Chưa nộp</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </PageShell>
  );
}

export default function DashboardPage() {
  return (
    <RequireRole roles={["thu_ky", "sep", "executive"]}>
      <DashboardContent />
    </RequireRole>
  );
}
