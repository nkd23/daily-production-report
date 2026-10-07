"use client";

import { useCallback, useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Info,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  Target,
} from "lucide-react";
import { RequireRole } from "@/components/RequireRole";
import { PageShell } from "@/components/PageShell";
import { SummaryTable } from "@/components/SummaryTable";
import { Badge, Button, Card, Input, StatCard } from "@/components/ui";
import { api } from "@/lib/api";
import { effClass } from "@/lib/eff-thresholds";
import { execColor } from "@/lib/exec-colors";
import { useSharedReportDate } from "@/lib/report-date-context";
import type { WeeklyDayPoint, WeeklyResponse } from "@/lib/types";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const COLOR_TARGET = "#99f6e4";
const COLOR_ACTUAL = "#0d9488";
const COLOR_EFF = "#f59e0b";

function toDate(iso: string) {
  return new Date(`${iso}T00:00:00`);
}

function toISO(d: Date) {
  return d.toLocaleDateString("sv-SE");
}

function addDays(iso: string, days: number) {
  const d = toDate(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

function mondayOf(iso: string) {
  const d = toDate(iso);
  return addDays(iso, -((d.getDay() + 6) % 7));
}

function ddmm(iso: string) {
  const d = toDate(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmt(n: number | null | undefined, suffix = "") {
  if (n === null || n === undefined) return "-";
  return `${n.toLocaleString("vi-VN")}${suffix}`;
}

function completionTone(rate: number | null): "success" | "warning" | "danger" | "default" {
  if (rate === null) return "default";
  if (rate >= 100) return "success";
  if (rate < 75) return "danger";
  return "warning";
}

const TONE_TEXT = { success: "text-success", warning: "text-warning", danger: "text-danger", default: "" };

interface DayChartRow {
  name: string;
  Target: number;
  "Thực tế": number;
  "EFF-FIN": number | null;
  point: WeeklyDayPoint;
}

function DayTooltip({ active, payload }: { active?: boolean; payload?: { payload: DayChartRow }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const p = row.point;
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm shadow-lg">
      <p className="mb-2 font-semibold text-foreground">{row.name}</p>
      {p.lines_submitted === 0 ? (
        <p className="text-muted">Không có báo cáo</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          <span className="text-muted">
            Target: <span className="font-medium text-foreground">{fmt(p.target_output)}</span>
          </span>
          <span className="text-muted">
            Thực tế: <span className="font-medium text-foreground">{fmt(p.actual_output)}</span>
            {p.completion_rate !== null ? ` (${p.completion_rate}%)` : ""}
          </span>
          <span className="text-muted">
            EFF-FIN: <span className="font-medium text-foreground">{fmt(p.avg_eff_fin, "%")}</span>
          </span>
          <span className="text-muted">
            Line đã nộp: <span className="font-medium text-foreground">{p.lines_submitted}</span>
          </span>
        </div>
      )}
    </div>
  );
}

const WIP_REASONS = [
  { key: "machine", label: "Do máy", color: "var(--warning)", tone: "warning" },
  { key: "line_spread", label: "Rải chuyền", color: "var(--primary)", tone: "primary" },
  { key: "semi_finished", label: "Bán thành phẩm", color: "var(--pu2)", tone: "pu2" },
  { key: "quality", label: "Chất lượng", color: "var(--danger)", tone: "danger" },
] as const;

function WeeklyContent() {
  const [reportDate, setReportDate] = useSharedReportDate(addDays(toISO(new Date()), -1));
  const [data, setData] = useState<WeeklyResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const weekStart = mondayOf(reportDate);
  const weekEnd = addDays(weekStart, 6);
  const isCurrentOrFuture = addDays(weekStart, 7) > toISO(new Date());

  const load = useCallback(() => {
    setLoading(true);
    api
      .dashboardWeekly(reportDate)
      .then(setData)
      .finally(() => setLoading(false));
  }, [reportDate]);

  useEffect(() => {
    load();
  }, [load]);

  const chartData: DayChartRow[] =
    data?.days.map((p, i) => ({
      name: `${WEEKDAYS[i]} ${ddmm(p.report_date)}`,
      Target: p.target_output,
      "Thực tế": p.actual_output,
      "EFF-FIN": p.avg_eff_fin,
      point: p,
    })) ?? [];

  const reasonMax = data ? Math.max(1, ...WIP_REASONS.map((r) => data.wip_reasons[r.key])) : 1;
  const reasonTotal = data ? WIP_REASONS.reduce((sum, r) => sum + data.wip_reasons[r.key], 0) : 0;

  return (
    <PageShell
      title="Báo cáo tuần"
      description={`Tuần ${data?.iso_week ?? ""} · Thứ 2 ${ddmm(weekStart)} – Chủ nhật ${ddmm(weekEnd)}/${toDate(weekEnd).getFullYear()}`}
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={() => setReportDate(addDays(weekStart, -7))}>
            <ChevronLeft size={14} /> Tuần trước
          </Button>
          <Input
            type="date"
            value={reportDate}
            onChange={(e) => e.target.value && setReportDate(e.target.value)}
            className="flex-none basis-44"
            title="Chọn 1 ngày bất kỳ - hiển thị cả tuần chứa ngày đó"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={isCurrentOrFuture}
            onClick={() => setReportDate(addDays(weekStart, 7))}
          >
            Tuần sau <ChevronRight size={14} />
          </Button>
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw size={14} /> Làm mới
          </Button>
        </>
      }
    >
      {loading || !data ? (
        <p className="text-sm text-muted">Đang tải...</p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Target tuần" value={fmt(data.kpi.total_target_output)} icon={Target} />
            <StatCard
              label="Output thực tế"
              value={fmt(data.kpi.total_actual_output)}
              sub={`${data.kpi.days_with_data}/7 ngày có số liệu`}
              tone={data.kpi.total_actual_output >= data.kpi.total_target_output ? "success" : "danger"}
              icon={PackageCheck}
            />
            <StatCard
              label="% Hoàn thành"
              value={fmt(data.kpi.completion_rate, "%")}
              tone={completionTone(data.kpi.completion_rate)}
              icon={CheckCircle2}
            />
            <StatCard label="EFF SEW TB tuần" value={fmt(data.kpi.avg_eff_sew, "%")} tone="primary" icon={Gauge} />
            <StatCard label="EFF FIN TB tuần" value={fmt(data.kpi.avg_eff_fin, "%")} tone="primary" icon={Gauge} />
            <StatCard
              label="Tồn trước PI cuối tuần"
              value={fmt(data.kpi.end_wip_pre_pi)}
              sub={`Tồn Dip: ${fmt(data.kpi.end_wip_dip)}`}
              tone={data.kpi.end_wip_pre_pi > 0 ? "warning" : "success"}
              icon={PackageOpen}
            />
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary-soft/40 px-4 py-3 text-xs text-muted">
            <Info size={15} className="mt-0.5 shrink-0 text-primary" />
            <p>
              <span className="font-medium text-foreground">Cách tính:</span> Target, Output, VAR, Số ca = cộng cả
              tuần · EFF = bình quân theo số ca của mọi line, mọi ngày (ngày chạy 2 ca tính gấp đôi) · Tồn = số tồn ở
              ngày báo cáo cuối cùng trong tuần của mỗi line (tồn là số tại một thời điểm, không cộng dồn).
            </p>
          </div>

          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Diễn biến từng ngày trong tuần</h2>
            {data.kpi.days_with_data === 0 ? (
              <p className="py-10 text-center text-sm text-muted">Chưa có báo cáo nào trong tuần này.</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="out" tick={{ fontSize: 12 }} />
                  <YAxis
                    yAxisId="eff"
                    orientation="right"
                    tick={{ fontSize: 12 }}
                    unit="%"
                    domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]}
                  />
                  <Tooltip content={<DayTooltip />} cursor={{ fill: "#f1f5f9" }} />
                  <Legend formatter={(value) => <span className="text-xs text-foreground">{value}</span>} />
                  <Bar yAxisId="out" dataKey="Target" fill={COLOR_TARGET} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} />
                  <Bar yAxisId="out" dataKey="Thực tế" fill={COLOR_ACTUAL} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} />
                  <Line
                    yAxisId="eff"
                    type="monotone"
                    dataKey="EFF-FIN"
                    stroke={COLOR_EFF}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: COLOR_EFF }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Ngày</th>
                    <th className="px-3 py-2 text-right font-medium">Line đã nộp</th>
                    <th className="px-3 py-2 text-right font-medium">Target</th>
                    <th className="px-3 py-2 text-right font-medium">Thực tế</th>
                    <th className="px-3 py-2 text-right font-medium">% HT</th>
                    <th className="px-3 py-2 text-right font-medium">EFF-SEW</th>
                    <th className="px-3 py-2 text-right font-medium">EFF-FIN</th>
                    <th className="px-3 py-2 text-right font-medium">Tồn Dip</th>
                    <th className="px-3 py-2 text-right font-medium">Tồn trước PI</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((p, i) =>
                    p.lines_submitted === 0 ? (
                      <tr key={p.report_date} className="border-b border-border text-muted">
                        <td className="px-3 py-2">
                          {WEEKDAYS[i]} {ddmm(p.report_date)}
                        </td>
                        <td colSpan={8} className="px-3 py-2 text-center text-xs italic">
                          Không có báo cáo
                        </td>
                      </tr>
                    ) : (
                      <tr key={p.report_date} className="border-b border-border">
                        <td className="px-3 py-2 font-medium">
                          {WEEKDAYS[i]} {ddmm(p.report_date)}
                        </td>
                        <td className="px-3 py-2 text-right">{p.lines_submitted}</td>
                        <td className="px-3 py-2 text-right">{fmt(p.target_output)}</td>
                        <td className="px-3 py-2 text-right">{fmt(p.actual_output)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${TONE_TEXT[completionTone(p.completion_rate)]}`}>
                          {fmt(p.completion_rate, "%")}
                        </td>
                        <td className="px-3 py-2 text-right">{fmt(p.avg_eff_sew, "%")}</td>
                        <td className="px-3 py-2 text-right">{fmt(p.avg_eff_fin, "%")}</td>
                        <td className="px-3 py-2 text-right">{fmt(p.wip_dip)}</td>
                        <td className="px-3 py-2 text-right">{fmt(p.wip_pre_pi)}</td>
                      </tr>
                    )
                  )}
                  <tr className="bg-primary font-semibold text-primary-foreground">
                    <td className="px-3 py-2">Cả tuần</td>
                    <td className="px-3 py-2 text-right">{data.kpi.days_with_data} ngày</td>
                    <td className="px-3 py-2 text-right">{fmt(data.kpi.total_target_output)}</td>
                    <td className="px-3 py-2 text-right">{fmt(data.kpi.total_actual_output)}</td>
                    <td className="px-3 py-2 text-right">{fmt(data.kpi.completion_rate, "%")}</td>
                    <td className="px-3 py-2 text-right">{fmt(data.kpi.avg_eff_sew, "%")}</td>
                    <td className="px-3 py-2 text-right">{fmt(data.kpi.avg_eff_fin, "%")}</td>
                    <td className="px-3 py-2 text-right" title="Số tồn cuối tuần">
                      {fmt(data.kpi.end_wip_dip)}
                    </td>
                    <td className="px-3 py-2 text-right" title="Số tồn cuối tuần">
                      {fmt(data.kpi.end_wip_pre_pi)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <h2 className="px-5 pt-5 text-sm font-semibold text-foreground">
              Tổng hợp tuần theo Executive / PU / TTL
            </h2>
            <SummaryTable
              rows={data.summary_table}
              emptyText="Chưa có line nào nộp báo cáo trong tuần này."
              wipHeaderSuffix=" (cuối tuần)"
              showWipAlert={false}
            />
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
              <PackageCheck size={16} className="text-warning" /> Lý do tồn trong tuần
            </h2>
            <p className="mb-4 text-xs text-muted">1 lượt = 1 line tích lý do đó trong 1 ngày.</p>
            {reasonTotal === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Không có line nào ghi nhận lý do tồn trong tuần này.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {WIP_REASONS.map((r) => {
                  const count = data.wip_reasons[r.key];
                  return (
                    <div key={r.key} className="flex items-center gap-3">
                      <span className="w-32 shrink-0 text-sm text-foreground">{r.label}</span>
                      <div className="h-5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(count / reasonMax) * 100}%`, backgroundColor: r.color }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right text-sm">
                        <span className="font-semibold text-foreground">{count}</span>{" "}
                        <span className="text-xs text-muted">lượt</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <h2 className="px-5 pt-5 text-sm font-semibold text-foreground">Chi tiết theo line</h2>
            <div className="mt-3 max-h-[560px] overflow-auto">
              <table className="w-full min-w-[1150px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Line</th>
                    <th className="px-3 py-2 font-medium">Executive</th>
                    <th className="px-3 py-2 text-right font-medium">Ngày nộp</th>
                    <th className="px-3 py-2 text-right font-medium">Số ca</th>
                    <th className="px-3 py-2 text-right font-medium">Target</th>
                    <th className="px-3 py-2 text-right font-medium">OUT-FIN (Fin)</th>
                    <th className="px-3 py-2 text-right font-medium">% HT</th>
                    <th className="px-3 py-2 text-right font-medium">EFF-SEW</th>
                    <th className="px-3 py-2 text-right font-medium">EFF-FIN</th>
                    <th className="px-3 py-2 text-right font-medium">VAR</th>
                    <th className="px-3 py-2 text-right font-medium">Tồn Dip</th>
                    <th className="px-3 py-2 text-right font-medium">Tồn trước PI</th>
                    <th className="px-3 py-2 font-medium">Lý do tồn</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => {
                    const execDot = (
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: execColor(l.executive_name).solid }}
                      />
                    );
                    if (l.days_submitted === 0) {
                      return (
                        <tr key={l.line_id} className="border-b border-border text-muted">
                          <td className="px-3 py-2 font-medium">{l.line_number}</td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-2">
                              {execDot}
                              {l.executive_name}
                            </span>
                          </td>
                          <td colSpan={11} className="px-3 py-2">
                            <Badge tone="warning">Chưa nộp ngày nào trong tuần</Badge>
                          </td>
                        </tr>
                      );
                    }
                    const reasons = [
                      { days: l.wip_machine_days, ...WIP_REASONS[0] },
                      { days: l.wip_line_spread_days, ...WIP_REASONS[1] },
                      { days: l.wip_semi_finished_days, ...WIP_REASONS[2] },
                      { days: l.wip_quality_days, ...WIP_REASONS[3] },
                    ].filter((r) => r.days > 0);
                    return (
                      <tr key={l.line_id} className="border-b border-border hover:bg-surface-muted/60">
                        <td className="px-3 py-2 font-medium">{l.line_number}</td>
                        <td className="px-3 py-2 text-muted">
                          <span className="flex items-center gap-2">
                            {execDot}
                            {l.executive_name}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">{l.days_submitted}</td>
                        <td className="px-3 py-2 text-right">{l.shift_total}</td>
                        <td className="px-3 py-2 text-right">{l.target_output ? fmt(l.target_output) : "-"}</td>
                        <td className="px-3 py-2 text-right">{fmt(l.out_fin_fin)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${TONE_TEXT[completionTone(l.completion_rate)]}`}>
                          {fmt(l.completion_rate, "%")}
                        </td>
                        <td className="px-3 py-2 text-right">{fmt(l.eff_sew, "%")}</td>
                        <td className={`px-3 py-2 text-right ${effClass(l.eff_fin, l.target_eff)}`}>
                          {fmt(l.eff_fin, "%")}
                        </td>
                        <td className={`px-3 py-2 text-right ${l.var < 0 ? "font-semibold text-danger" : ""}`}>
                          {fmt(l.var)}
                        </td>
                        <td className="px-3 py-2 text-right">{fmt(l.wip_dip)}</td>
                        <td className="px-3 py-2 text-right">{fmt(l.wip_pre_pi)}</td>
                        <td className="px-3 py-2">
                          {reasons.length === 0 ? (
                            <span className="text-muted">-</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {reasons.map((r) => (
                                <Badge key={r.key} tone={r.tone}>
                                  {r.label} ×{r.days}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {data.kpi.issue_line_days > 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <AlertTriangle size={13} className="text-warning" />
              Trong tuần có {data.kpi.issue_line_days} lượt line ghi issue - xem chi tiết từng ngày ở Dashboard hoặc Dữ
              liệu sản xuất.
            </p>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}

export default function WeeklyReportPage() {
  return (
    <RequireRole roles={["thu_ky", "sep", "executive"]}>
      <WeeklyContent />
    </RequireRole>
  );
}
