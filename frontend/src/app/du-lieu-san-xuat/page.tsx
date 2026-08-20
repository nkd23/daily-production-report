"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Download, RefreshCw, X } from "lucide-react";
import { RequireRole } from "@/components/RequireRole";
import { PageShell } from "@/components/PageShell";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { effClass as effCellClass } from "@/lib/eff-thresholds";
import { useSharedReportDate } from "@/lib/report-date-context";
import { wipExceedsOutClass } from "@/lib/wip-alert";
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

// Every row shows the same compact button regardless of issue text length,
// so table rows stay a uniform height - the full note only appears in a
// popup on demand instead of wrapping and stretching the row inline.
function IssueCell({ line }: { line: LineDaySummary }) {
  const [open, setOpen] = useState(false);
  if (!line.issue_note) return <span className="text-muted">-</span>;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-warning/40 bg-warning-soft px-2 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/20"
      >
        <AlertTriangle size={12} /> Xem issue
      </button>
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
              onClick={() => setOpen(false)}
            >
              <div
                className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-foreground">Issue - Line {line.line_number}</h2>
                  <button onClick={() => setOpen(false)} className="text-muted transition-colors hover:text-foreground">
                    <X size={16} />
                  </button>
                </div>
                <p className="text-xs text-muted">
                  {line.executive_name}
                  {line.buyer ? ` · ${line.buyer}` : ""}
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{line.issue_note}</p>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function wipReasonBadges(line: LineDaySummary) {
  if (!line.wip_reason_machine && !line.wip_reason_line_spread && !line.wip_reason_semi_finished) {
    return <span className="text-muted">-</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {line.wip_reason_machine ? <Badge tone="warning">Do máy</Badge> : null}
      {line.wip_reason_line_spread ? <Badge tone="primary">Rải chuyền</Badge> : null}
      {line.wip_reason_semi_finished ? <Badge tone="pu2">Bán thành phẩm</Badge> : null}
    </div>
  );
}

function LineRow({ line }: { line: LineDaySummary }) {
  const wipAlert = wipExceedsOutClass(line.wip_pre_pi, line.out_fin_fin);
  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-muted/60">
      <td className="whitespace-nowrap px-3 py-2 font-medium">{line.line_number}</td>
      <td className="px-3 py-2 text-muted">{line.buyer ?? "-"}</td>
      <td className="px-3 py-2 text-right">{line.target_output ? num(line.target_output) : "-"}</td>
      <td className="px-3 py-2 text-right">{line.target_eff ? pct(line.target_eff) : "-"}</td>
      <td className="px-3 py-2 text-right">{line.sam || "-"}</td>
      <td className="px-3 py-2 text-right">{line.shift_display}</td>
      <td className="px-3 py-2 text-right">{num(line.out_sew)}</td>
      <td className="px-3 py-2 text-right">{pct(line.eff_sew)}</td>
      <td className="px-3 py-2 text-right">{num(line.out_fin_scanpack)}</td>
      <td className={`px-3 py-2 text-right ${wipAlert}`}>{num(line.out_fin_fin)}</td>
      <td className={`px-3 py-2 text-right ${effCellClass(line.eff_fin, line.target_eff)}`}>
        {pct(line.eff_fin)}
      </td>
      <td className={`px-3 py-2 text-right ${line.var !== null && line.var < 0 ? "text-danger font-semibold" : ""}`}>
        {num(line.var)}
      </td>
      <td className="px-3 py-2 text-right">{num(line.wip_dip)}</td>
      <td className={`px-3 py-2 text-right ${wipAlert}`} title={wipAlert ? "Tồn trước PI đang nhiều hơn OUT-FIN (Fin)" : undefined}>
        {num(line.wip_pre_pi)}
      </td>
      <td className="px-3 py-2">{wipReasonBadges(line)}</td>
      <td className="px-3 py-2">
        {line.is_submitted ? <Badge tone="success">Đã nộp</Badge> : <Badge tone="warning">Chưa nộp</Badge>}
      </td>
      <td className="px-3 py-2">
        <IssueCell line={line} />
      </td>
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
  // On the TTL row (already bg-primary), the danger tint would be
  // invisible - fall back to a bold underline so it still reads as a flag.
  const wipAlert = wipExceedsOutClass(row.wip_pre_pi, row.out_fin_fin);
  const wipCellCls = row.level === "ttl" && wipAlert ? "underline decoration-2 underline-offset-2 font-bold" : wipAlert;
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
      <td className={`px-3 py-2 text-right ${wipCellCls}`}>{num(row.out_fin_fin)}</td>
      <td className="px-3 py-2 text-right">{pct(row.eff_fin_avg)}</td>
      <td className={`px-3 py-2 text-right ${row.var < 0 ? "text-danger" : ""}`}>{num(row.var)}</td>
      <td className="px-3 py-2 text-right">{num(row.wip_dip)}</td>
      <td className={`px-3 py-2 text-right ${wipCellCls}`} title={wipAlert ? "Tồn trước PI đang nhiều hơn OUT-FIN (Fin)" : undefined}>
        {num(row.wip_pre_pi)}
      </td>
      <td className="px-3 py-2" colSpan={3} />
    </tr>
  );
}

const STATUS_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "submitted", label: "Đã nộp" },
  { value: "pending", label: "Chưa nộp" },
] as const;

const WIP_REASON_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "machine", label: "Do máy" },
  { value: "line_spread", label: "Rải chuyền" },
  { value: "semi_finished", label: "Bán thành phẩm" },
] as const;

function DuLieuSanXuatContent() {
  const { user } = useAuth();
  const canExport = user?.role !== "executive";
  const [reportDate, setReportDate] = useSharedReportDate(todayISO());
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState("");
  const [puFilter, setPuFilter] = useState("");
  const [execFilter, setExecFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("");
  const [wipReasonFilter, setWipReasonFilter] = useState<(typeof WIP_REASON_OPTIONS)[number]["value"]>("");

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

  const executiveNames = useMemo(
    () => [...new Set((data?.lines ?? []).map((l) => l.executive_name))].sort(),
    [data]
  );

  const hasActiveFilter =
    search.trim() !== "" || puFilter !== "" || execFilter !== "" || statusFilter !== "" || wipReasonFilter !== "";

  const filteredLines = useMemo(() => {
    const q = search.trim().toUpperCase();
    return (data?.lines ?? []).filter((l) => {
      if (puFilter && l.pu_group !== puFilter) return false;
      if (execFilter && l.executive_name !== execFilter) return false;
      if (statusFilter === "submitted" && !l.is_submitted) return false;
      if (statusFilter === "pending" && l.is_submitted) return false;
      if (wipReasonFilter === "machine" && !l.wip_reason_machine) return false;
      if (wipReasonFilter === "line_spread" && !l.wip_reason_line_spread) return false;
      if (wipReasonFilter === "semi_finished" && !l.wip_reason_semi_finished) return false;
      if (q && !l.line_number.toUpperCase().includes(q) && !(l.buyer ?? "").toUpperCase().includes(q)) return false;
      return true;
    });
  }, [data, search, puFilter, execFilter, statusFilter, wipReasonFilter]);

  const groups = data ? groupLines(hasActiveFilter ? filteredLines : data.lines) : [];
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
          {canExport ? (
            <Button size="sm" disabled={exporting} onClick={handleExport}>
              <Download size={14} /> {exporting ? "Đang xuất..." : "Xuất Excel"}
            </Button>
          ) : null}
        </>
      }
    >
      {loading || !data ? (
        <p className="text-sm text-muted">Đang tải...</p>
      ) : (
        <>
          <Card className="mb-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[180px] flex-1">
                <Label>Tìm Line / Buyer</Label>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="VD: 09AB hoặc MUJI"
                />
              </div>
              <div>
                <Label>PU</Label>
                <Select value={puFilter} onChange={(e) => setPuFilter(e.target.value)} className="w-28">
                  <option value="">Tất cả</option>
                  <option value="PU1">PU1</option>
                  <option value="PU2">PU2</option>
                </Select>
              </div>
              <div>
                <Label>Executive</Label>
                <Select value={execFilter} onChange={(e) => setExecFilter(e.target.value)} className="w-36">
                  <option value="">Tất cả</option>
                  {executiveNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Trạng thái</Label>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as (typeof STATUS_OPTIONS)[number]["value"])}
                  className="w-32"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Lý do tồn</Label>
                <Select
                  value={wipReasonFilter}
                  onChange={(e) => setWipReasonFilter(e.target.value as (typeof WIP_REASON_OPTIONS)[number]["value"])}
                  className="w-36"
                >
                  {WIP_REASON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
              {hasActiveFilter ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setPuFilter("");
                    setExecFilter("");
                    setStatusFilter("");
                    setWipReasonFilter("");
                  }}
                >
                  <X size={14} /> Xóa bộ lọc
                </Button>
              ) : null}
              {hasActiveFilter ? (
                <span className="text-xs text-muted">
                  {filteredLines.length} / {data.lines.length} line - đã ẩn dòng tổng hợp vì đang lọc
                </span>
              ) : null}
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
          <div className="max-h-[calc(100vh-260px)] overflow-auto">
            <table className="w-full min-w-[1550px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-muted">
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 font-medium">Line</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 font-medium">Buyer</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 text-right font-medium">Target SL</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 text-right font-medium">Target EFF</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 text-right font-medium">SAM</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 text-right font-medium">Số ca</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 text-right font-medium">OUT-SEW</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 text-right font-medium">EFF-SEW</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 text-right font-medium">OUT-FIN (Scan)</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 text-right font-medium">OUT-FIN (Fin)</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 text-right font-medium">EFF-FIN</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 text-right font-medium">VAR</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 text-right font-medium">Tồn Dip</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 text-right font-medium">Tồn trước PI</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 font-medium">Lý do tồn</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 font-medium">Trạng thái</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2 font-medium">Issue</th>
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
                        {hasActiveFilter ? null : (
                          <SubtotalRow
                            row={summaryTable.find(
                              (r) => r.level === "executive" && r.label === exec.executive_name
                            )}
                          />
                        )}
                      </Fragment>
                    ))}
                    {hasActiveFilter ? null : (
                      <SubtotalRow
                        row={summaryTable.find((r) => r.level === "pu" && r.label === `${pu.pu_group} - TTL`)}
                      />
                    )}
                  </Fragment>
                ))}
                {hasActiveFilter ? null : <SubtotalRow row={ttlRow} />}
                {groups.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="px-4 py-10 text-center text-sm text-muted">
                      {hasActiveFilter ? "Không có line nào khớp bộ lọc." : "Chưa có line nào được cấu hình."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          </Card>
        </>
      )}
    </PageShell>
  );
}

export default function DuLieuSanXuatPage() {
  return (
    <RequireRole roles={["thu_ky", "sep", "executive"]}>
      <DuLieuSanXuatContent />
    </RequireRole>
  );
}
