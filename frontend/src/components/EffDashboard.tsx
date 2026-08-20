"use client";

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
import { CheckCircle2, Gauge, XCircle } from "lucide-react";
import { Badge, Card, StatCard } from "@/components/ui";
import { effClass } from "@/lib/eff-thresholds";
import { execColor } from "@/lib/exec-colors";
import type { DashboardResponse, ExecutiveSummary, LineDaySummary } from "@/lib/types";

export type EffMetric = "sew" | "fin";

function pct(n: number | null | undefined) {
  return n === null || n === undefined ? "-" : `${n}%`;
}

function lineEff(line: LineDaySummary, metric: EffMetric): number | null {
  return metric === "sew" ? line.eff_sew : line.eff_fin;
}

function execEffAvg(exec: ExecutiveSummary, metric: EffMetric): number | null {
  return metric === "sew" ? exec.eff_sew_avg : exec.eff_fin_avg;
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
        <span className="text-muted">Target EFF:</span>
        <span className="font-medium text-foreground">{row.Target}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.solid }} />
        <span className="text-muted">Thực tế:</span>
        <span className="font-medium text-foreground">{row["Thực tế"]}%</span>
      </div>
    </div>
  );
}

interface StatusPieRow {
  name: string;
  value: number;
  color: string;
}

const STATUS_COLORS: Record<string, string> = {
  "Đạt": "#16a34a",
  "Không đạt": "#dc2626",
};

function StatusPieTooltip({ active, payload }: { active?: boolean; payload?: { payload: StatusPieRow }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm shadow-lg">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
        <span className="font-semibold text-foreground">{row.name}</span>
      </div>
      <p className="mt-1 text-muted">
        Số line: <span className="font-medium text-foreground">{row.value}</span>
      </p>
    </div>
  );
}

interface ExecStatusRow {
  name: string;
  "Đạt": number;
  "Không đạt": number;
}

function ExecStatusTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: { dataKey: string; value: number; color: string }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm shadow-lg">
      <p className="mb-2 font-semibold text-foreground">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted">{p.dataKey}:</span>
          <span className="font-medium text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// Content-only panel: the parent (Dashboard page) owns the date picker,
// data fetch, and PageShell so switching between Tổng quan / EFF-SEW /
// EFF-FIN tabs never re-fetches - all 3 read the same GET /api/dashboard
// response already in memory.
export function EffPanel({ metric, data }: { metric: EffMetric; data: DashboardResponse }) {
  const metricLabel = metric === "sew" ? "EFF-SEW" : "EFF-FIN";
  const avgEff = metric === "sew" ? data.kpi.avg_eff_sew : data.kpi.avg_eff_fin;

  // Lines with both a real EFF value and a real target this day can be
  // judged Đạt/Không đạt; anything else (not submitted, or never given a
  // target) can't be judged either way.
  const classifiable = data.lines.filter((l) => lineEff(l, metric) !== null && l.target_eff > 0);
  const onTarget = classifiable.filter((l) => lineEff(l, metric)! >= l.target_eff);
  const notOnTarget = classifiable.filter((l) => lineEff(l, metric)! < l.target_eff);

  const execChartData: ExecChartRow[] = data.executives
    .map((e) => {
      const targetRow = data.summary_table.find((r) => r.level === "executive" && r.label === e.executive_name);
      return {
        name: `${e.executive_name} (${e.pu_group})`,
        executive: e.executive_name,
        Target: targetRow?.target_eff_avg ?? 0,
        "Thực tế": execEffAvg(e, metric) ?? 0,
      };
    })
    .filter((row) => row.Target > 0 || row["Thực tế"] > 0);

  const statusPieData: StatusPieRow[] = [
    { name: "Đạt", value: onTarget.length, color: STATUS_COLORS["Đạt"] },
    { name: "Không đạt", value: notOnTarget.length, color: STATUS_COLORS["Không đạt"] },
  ].filter((row) => row.value > 0);

  // Same 2 buckets as the pie above, but broken down per Executive so Sếp
  // can see who owns the lines chưa đạt instead of just the total.
  const execStatusData: ExecStatusRow[] = data.executives
    .map((e) => ({
      name: `${e.executive_name} (${e.pu_group})`,
      "Đạt": onTarget.filter((l) => l.executive_name === e.executive_name).length,
      "Không đạt": notOnTarget.filter((l) => l.executive_name === e.executive_name).length,
    }))
    .filter((row) => row["Đạt"] + row["Không đạt"] > 0);

  // Worst EFF first so Sếp sees the biggest problem lines immediately - lines
  // with no value yet (not submitted) sort to the bottom, not treated as 0%.
  const sortedLines = [...data.lines].sort((a, b) => {
    const av = lineEff(a, metric);
    const bv = lineEff(b, metric);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return av - bv;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label={`${metricLabel} trung bình`} value={pct(avgEff)} tone="primary" icon={Gauge} />
        <StatCard
          label="Đạt target"
          value={String(onTarget.length)}
          sub={`/ ${classifiable.length} line có số liệu`}
          tone="success"
          icon={CheckCircle2}
        />
        <StatCard
          label="Không đạt target"
          value={String(notOnTarget.length)}
          sub={`/ ${classifiable.length} line có số liệu`}
          tone="danger"
          icon={XCircle}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">{metricLabel} theo Executive (Target vs Thực tế)</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {[...new Set(execChartData.map((d) => d.executive))].map((exec) => (
                <span key={exec} className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: execColor(exec).solid }} />
                  {exec}
                </span>
              ))}
            </div>
          </div>
          {execChartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Chưa có line nào nộp báo cáo ngày này.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, execChartData.length * 56)}>
              <BarChart data={execChartData} layout="vertical" margin={{ left: 40 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} unit="%" />
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
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Tỷ trọng line Đạt/Không đạt</h2>
          {statusPieData.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Chưa có line nào nộp báo cáo ngày này.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={statusPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  isAnimationActive={false}
                  label={(entry: { value?: number }) => entry.value}
                  labelLine={false}
                >
                  {statusPieData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<StatusPieTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Số line Đạt/Không đạt - theo Executive</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {(["Đạt", "Không đạt"] as const).map((label) => (
              <span key={label} className="flex items-center gap-1.5 text-xs text-muted">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[label] }} />
                {label}
              </span>
            ))}
          </div>
        </div>
        {execStatusData.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Chưa có line nào nộp báo cáo ngày này.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, execStatusData.length * 50)}>
            <BarChart data={execStatusData} layout="vertical" margin={{ left: 40 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={140} />
              <Tooltip content={<ExecStatusTooltip />} cursor={{ fill: "#f1f5f9" }} />
              <Bar dataKey="Đạt" stackId="status" fill={STATUS_COLORS["Đạt"]} radius={[0, 0, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              <Bar dataKey="Không đạt" stackId="status" fill={STATUS_COLORS["Không đạt"]} radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <h2 className="px-5 pt-5 text-sm font-semibold text-foreground">
          Chi tiết từng Line - {metricLabel} thấp nhất lên đầu
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Line</th>
                <th className="px-4 py-2 font-medium">Executive</th>
                <th className="px-4 py-2 font-medium">Buyer</th>
                <th className="px-4 py-2 text-right font-medium">Target EFF</th>
                <th className="px-4 py-2 text-right font-medium">{metricLabel}</th>
                <th className="px-4 py-2 text-right font-medium">Chênh lệch</th>
                <th className="px-4 py-2 font-medium">Trạng thái nộp</th>
              </tr>
            </thead>
            <tbody>
              {sortedLines.map((line) => {
                const actual = lineEff(line, metric);
                const diff = actual !== null && line.target_eff ? Math.round((actual - line.target_eff) * 10) / 10 : null;
                return (
                  <tr key={line.line_id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 font-medium">{line.line_number}</td>
                    <td className="px-4 py-2 text-muted">{line.executive_name}</td>
                    <td className="px-4 py-2 text-muted">{line.buyer ?? "-"}</td>
                    <td className="px-4 py-2 text-right">{line.target_eff > 0 ? pct(line.target_eff) : "-"}</td>
                    <td className={`px-4 py-2 text-right ${effClass(actual, line.target_eff)}`}>{pct(actual)}</td>
                    <td className={`px-4 py-2 text-right ${diff !== null && diff < 0 ? "text-danger font-semibold" : ""}`}>
                      {diff !== null ? `${diff > 0 ? "+" : ""}${diff}%` : "-"}
                    </td>
                    <td className="px-4 py-2">
                      {line.is_submitted ? <Badge tone="success">Đã nộp</Badge> : <Badge tone="warning">Chưa nộp</Badge>}
                    </td>
                  </tr>
                );
              })}
              {sortedLines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted">
                    Chưa có line nào được cấu hình.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
