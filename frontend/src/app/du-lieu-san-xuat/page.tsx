"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { RequireRole } from "@/components/RequireRole";
import { PageShell } from "@/components/PageShell";
import { Badge, Button, Card, Input } from "@/components/ui";
import { api } from "@/lib/api";
import type { DashboardResponse, GroupSummary, LineDaySummary } from "@/lib/types";

function todayISO() {
  return new Date().toLocaleDateString("sv-SE");
}

function formatVietnameseDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function num(n: number | null | undefined) {
  return n === null || n === undefined ? "-" : n.toLocaleString("vi-VN");
}

function pct(n: number | null | undefined) {
  return n === null || n === undefined ? "-" : `${n}%`;
}

// Mirrors EFF_WARNING_THRESHOLD / EFF_CRITICAL_THRESHOLD in
// backend/app/services/excel_export.py - keep in sync.
const EFF_WARNING_THRESHOLD = 0.75;
const EFF_CRITICAL_THRESHOLD = 0.6;
function effCellClass(actual: number | null, target: number | null) {
  if (actual === null || !target) return "";
  const ratio = actual / target;
  if (ratio < EFF_CRITICAL_THRESHOLD) return "bg-danger-soft text-danger font-semibold";
  if (ratio < EFF_WARNING_THRESHOLD) return "bg-warning-soft text-warning font-semibold";
  return "";
}

interface ExecGroup {
  executive_name: string;
  lines: LineDaySummary[];
}
interface PuGroup {
  pu_group: string;
  execs: ExecGroup[];
}

function groupLines(lines: LineDaySummary[]): PuGroup[] {
  const puOrder: string[] = [];
  const byPu = new Map<string, ExecGroup[]>();
  for (const line of lines) {
    if (!byPu.has(line.pu_group)) {
      byPu.set(line.pu_group, []);
      puOrder.push(line.pu_group);
    }
    const execs = byPu.get(line.pu_group)!;
    let group = execs.find((e) => e.executive_name === line.executive_name);
    if (!group) {
      group = { executive_name: line.executive_name, lines: [] };
      execs.push(group);
    }
    group.lines.push(line);
  }
  return puOrder.map((pu) => ({ pu_group: pu, execs: byPu.get(pu)! }));
}

function LineRow({ line }: { line: LineDaySummary }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-muted/60">
      <td className="whitespace-nowrap px-3 py-2 font-medium">{line.line_number}</td>
      <td className="px-3 py-2 text-muted">{line.buyer ?? "-"}</td>
      <td className="px-3 py-2 text-right">{line.target_output ? num(line.target_output) : "-"}</td>
      <td className="px-3 py-2 text-right">{line.target_eff ? pct(line.target_eff) : "-"}</td>
      <td className="px-3 py-2 text-right">{line.sam || "-"}</td>
      <td className="px-3 py-2 text-right">{line.shift_display}</td>
      <td className="px-3 py-2 text-right">{num(line.out_sew)}</td>
      <td className={`px-3 py-2 text-right ${effCellClass(line.eff_sew, line.target_eff)}`}>
        {pct(line.eff_sew)}
      </td>
      <td className="px-3 py-2 text-right">{num(line.out_fin_scanpack)}</td>
      <td className="px-3 py-2 text-right">{num(line.out_fin_fin)}</td>
      <td className={`px-3 py-2 text-right ${effCellClass(line.eff_fin, line.target_eff)}`}>
        {pct(line.eff_fin)}
      </td>
      <td className={`px-3 py-2 text-right ${line.var !== null && line.var < 0 ? "text-danger font-semibold" : ""}`}>
        {num(line.var)}
      </td>
      <td className="px-3 py-2 text-right">{num(line.wip_dip)}</td>
      <td className="px-3 py-2 text-right">{num(line.wip_pre_pi)}</td>
      <td className="px-3 py-2">
        {line.is_submitted ? <Badge tone="success">Đã nộp</Badge> : <Badge tone="warning">Chưa nộp</Badge>}
      </td>
      <td className="max-w-[220px] px-3 py-2 text-muted">{line.issue_note ?? "-"}</td>
    </tr>
  );
}

function SubtotalRow({ row }: { row: GroupSummary | undefined }) {
  if (!row) return null;
  const cls =
    row.level === "ttl"
      ? "bg-primary text-primary-foreground font-semibold"
      : row.level === "pu"
        ? "border-b border-border bg-surface-muted font-semibold"
        : "border-b border-border bg-primary-soft/40 font-semibold";
  return (
    <tr className={cls}>
      <td className="px-3 py-2" colSpan={2}>
        {row.label}
      </td>
      <td className="px-3 py-2 text-right">{row.target_output ? num(row.target_output) : "-"}</td>
      <td className="px-3 py-2 text-right">{pct(row.target_eff_avg)}</td>
      <td className="px-3 py-2 text-right">{row.sam_avg ?? "-"}</td>
      <td className="px-3 py-2 text-right">{row.shift_total || "-"}</td>
      <td className="px-3 py-2 text-right">{num(row.out_sew)}</td>
      <td className="px-3 py-2 text-right">{pct(row.eff_sew_avg)}</td>
      <td className="px-3 py-2 text-right">{num(row.out_fin_scanpack)}</td>
      <td className="px-3 py-2 text-right">{num(row.out_fin_fin)}</td>
      <td className="px-3 py-2 text-right">{pct(row.eff_fin_avg)}</td>
      <td className={`px-3 py-2 text-right ${row.var < 0 ? "text-danger" : ""}`}>{num(row.var)}</td>
      <td className="px-3 py-2 text-right">{num(row.wip_dip)}</td>
      <td className="px-3 py-2 text-right">{num(row.wip_pre_pi)}</td>
      <td className="px-3 py-2" colSpan={2} />
    </tr>
  );
}

function DuLieuSanXuatContent() {
  const [reportDate, setReportDate] = useState(todayISO());
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

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

  const groups = data ? groupLines(data.lines) : [];
  const summaryTable = data?.summary_table ?? [];
  const ttlRow = summaryTable.find((r) => r.level === "ttl");

  return (
    <PageShell
      title="Dữ liệu sản xuất"
      description={`${formatVietnameseDate(reportDate)} · Bảng tổng hợp toàn bộ số liệu các chuyền đã nhập`}
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
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-muted">
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Line</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Buyer</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Target SL</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Target EFF</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">SAM</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Số ca</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">OUT-SEW</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">EFF-SEW</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">OUT-FIN (Scan)</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">OUT-FIN (Fin)</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">EFF-FIN</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">VAR</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Tồn Dip</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Tồn trước PI</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Trạng thái</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Issue</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((pu) => (
                  <Fragment key={pu.pu_group}>
                    {pu.execs.map((exec) => (
                      <Fragment key={exec.executive_name}>
                        {exec.lines.map((line) => (
                          <LineRow key={line.line_id} line={line} />
                        ))}
                        <SubtotalRow
                          row={summaryTable.find(
                            (r) => r.level === "executive" && r.label === exec.executive_name
                          )}
                        />
                      </Fragment>
                    ))}
                    <SubtotalRow
                      row={summaryTable.find((r) => r.level === "pu" && r.label === `${pu.pu_group} - TTL`)}
                    />
                  </Fragment>
                ))}
                <SubtotalRow row={ttlRow} />
                {groups.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="px-4 py-10 text-center text-sm text-muted">
                      Chưa có line nào được cấu hình.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageShell>
  );
}

export default function DuLieuSanXuatPage() {
  return (
    <RequireRole roles={["thu_ky", "sep"]}>
      <DuLieuSanXuatContent />
    </RequireRole>
  );
}
