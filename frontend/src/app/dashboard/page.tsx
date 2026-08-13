"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Download, RefreshCw } from "lucide-react";
import { RequireRole } from "@/components/RequireRole";
import { PageShell } from "@/components/PageShell";
import { Badge, Button, Card, Input, StatCard } from "@/components/ui";
import { api } from "@/lib/api";
import type { DashboardResponse } from "@/lib/types";

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

// One color per Executive (the person whose Tổ trưởng report up to them,
// not a Tổ trưởng themselves) so their lines are visually grouped in charts.
// Target bar = lighter tint, Thực tế bar = solid, of the same hue.
const EXEC_COLORS: Record<string, { light: string; solid: string }> = {
  "Ms Thảo": { light: "#fbbf24", solid: "#b45309" }, // amber
  "Ms Hương": { light: "#a78bfa", solid: "#5b21b6" }, // violet
  "Ms Doan": { light: "#34d399", solid: "#047857" }, // emerald
  "Ms Phương": { light: "#60a5fa", solid: "#1d4ed8" }, // blue
  "Ms Huệ": { light: "#f472b6", solid: "#be185d" }, // pink
};
const FALLBACK_COLOR = { light: "#94a3b8", solid: "#334155" }; // slate, for any other Executive
function execColor(name: string) {
  return EXEC_COLORS[name] ?? FALLBACK_COLOR;
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

function DashboardContent() {
  const [reportDate, setReportDate] = useState(yesterdayISO());
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

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
    data?.executives.map((e) => ({
      name: `${e.executive_name} (${e.pu_group})`,
      Target: e.target_output,
      "Thực tế": e.out_fin_fin,
      negative: e.var < 0,
    })) ?? [];

  return (
    <PageShell
      title="Dashboard sản lượng"
      description={formatVietnameseDate(reportDate)}
      actions={
        <>
          <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-auto" />
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw size={14} /> Làm mới
          </Button>
          <Button size="sm" disabled={exporting} onClick={handleExport}>
            <Download size={14} /> {exporting ? "Đang xuất..." : "Xuất Excel"}
          </Button>
        </>
      }
    >
      {loading || !data ? (
        <p className="text-sm text-muted">Đang tải...</p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Target Output" value={fmt(data.kpi.total_target_output)} />
            <StatCard
              label="Actual Output"
              value={fmt(data.kpi.total_actual_output)}
              tone={data.kpi.total_actual_output >= data.kpi.total_target_output ? "success" : "danger"}
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
            />
            <StatCard label="EFF SEW TB" value={data.kpi.avg_eff_sew !== null ? `${data.kpi.avg_eff_sew}%` : "-"} tone="primary" />
            <StatCard label="EFF FIN TB" value={data.kpi.avg_eff_fin !== null ? `${data.kpi.avg_eff_fin}%` : "-"} tone="primary" />
            <StatCard
              label="Line có Issue"
              value={String(data.kpi.lines_with_issue)}
              sub={`${data.kpi.lines_submitted}/${data.kpi.lines_total} line đã nộp`}
              tone={data.kpi.lines_with_issue > 0 ? "warning" : "success"}
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
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<LineChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="Target" radius={[4, 4, 0, 0]} maxBarSize={36}>
                    {lineChartData.map((entry, idx) => (
                      <Cell key={idx} fill={execColor(entry.executive).light} />
                    ))}
                  </Bar>
                  <Bar dataKey="Thực tế" radius={[4, 4, 0, 0]} maxBarSize={36}>
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
                <Tooltip cursor={{ fill: "#f1f5f9" }} />
                <Legend />
                <Bar dataKey="Target" fill="#cbd5e1" radius={[0, 4, 4, 0]} maxBarSize={22} />
                <Bar dataKey="Thực tế" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {execChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.negative ? "#dc2626" : "#16a34a"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle size={16} className="text-warning" /> Issue trong ngày
              </h2>
              {data.issues.length === 0 ? (
                <p className="text-sm text-muted">Không có issue nào được ghi nhận.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {data.issues.map((issue, idx) => (
                    <li key={idx} className="rounded-lg border border-border bg-surface-muted p-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {issue.line_number}
                        <Badge tone="default">{issue.buyer}</Badge>
                        <span className="text-xs font-normal text-muted">{issue.executive_name}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted">{issue.issue_note}</p>
                    </li>
                  ))}
                </ul>
              )}
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
        </div>
      )}
    </PageShell>
  );
}

export default function DashboardPage() {
  return (
    <RequireRole roles={["thu_ky", "sep"]}>
      <DashboardContent />
    </RequireRole>
  );
}
