"use client";

import { useEffect, useState } from "react";
import { History, Trash2 } from "lucide-react";
import { Badge } from "./ui";
import { api, ApiError } from "@/lib/api";
import type { DailyReport } from "@/lib/types";

function wipReasonBadges(r: DailyReport) {
  if (!r.wip_reason_machine && !r.wip_reason_line_spread && !r.wip_reason_semi_finished) {
    return <span className="text-muted">-</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {r.wip_reason_machine ? <Badge tone="warning">Do máy</Badge> : null}
      {r.wip_reason_line_spread ? <Badge tone="primary">Rải chuyền</Badge> : null}
      {r.wip_reason_semi_finished ? <Badge tone="pu2">Bán thành phẩm</Badge> : null}
    </div>
  );
}

function formatDate(dateIso: string) {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString("vi-VN");
}

function formatTime(iso: string | null) {
  if (!iso) return "-";
  // submitted_at comes back as a naive local datetime string (no timezone
  // suffix), which the Date constructor already parses as local time.
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function num(n: number | null) {
  return n === null || n === undefined ? "-" : n.toLocaleString("vi-VN");
}

function pct(n: number | null) {
  return n === null || n === undefined ? "-" : `${n}%`;
}

// Refetches whenever `version` changes - the parent bumps it after a
// successful submit/delete so a freshly-entered day shows up right away.
export function SubmissionHistory({
  lineId,
  version,
  onDeleted,
}: {
  lineId: number;
  version: number;
  onDeleted?: () => void;
}) {
  const [reports, setReports] = useState<DailyReport[] | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    api.getRecentReports(lineId).then(setReports);
  }, [lineId, version]);

  async function handleDeleteRow(r: DailyReport) {
    if (!window.confirm(`Xóa số liệu đã nhập ngày ${formatDate(r.report_date)}?\nKhông thể hoàn tác.`)) {
      return;
    }
    setDeletingId(r.id);
    try {
      await api.deleteReport(lineId, r.report_date);
      setReports((prev) => (prev ? prev.filter((x) => x.id !== r.id) : prev));
      onDeleted?.();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Không xóa được, vui lòng thử lại");
    } finally {
      setDeletingId(null);
    }
  }

  if (!reports || reports.length === 0) return null;

  return (
    <div className="border-t border-border px-5 py-4">
      <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <History size={14} /> Lịch sử đã nhập
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1020px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th className="whitespace-nowrap px-2 py-1.5 font-medium">Ngày</th>
              <th className="whitespace-nowrap px-2 py-1.5 font-medium">Giờ nộp</th>
              <th className="whitespace-nowrap px-2 py-1.5 font-medium">Buyer</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Ca</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">OUT-SEW</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">EFF-SEW</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">OUT-FIN</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">EFF-FIN</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Tồn Dip</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Tồn trước PI</th>
              <th className="whitespace-nowrap px-2 py-1.5 font-medium">Lý do tồn</th>
              <th className="whitespace-nowrap px-2 py-1.5 font-medium">Issue</th>
              <th className="whitespace-nowrap px-2 py-1.5 font-medium text-right">Xóa</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-2 py-1.5 font-medium">{formatDate(r.report_date)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-muted">{formatTime(r.submitted_at)}</td>
                <td className="px-2 py-1.5 text-muted">{r.buyer ?? "-"}</td>
                <td className="px-2 py-1.5 text-right">{r.shift_count}</td>
                <td className="px-2 py-1.5 text-right">{num(r.out_sew)}</td>
                <td className="px-2 py-1.5 text-right">{pct(r.eff_sew)}</td>
                <td className="px-2 py-1.5 text-right">{num(r.out_fin_fin)}</td>
                <td className="px-2 py-1.5 text-right">{pct(r.eff_fin)}</td>
                <td className="px-2 py-1.5 text-right">{num(r.wip_dip)}</td>
                <td className="px-2 py-1.5 text-right">{num(r.wip_pre_pi)}</td>
                <td className="px-2 py-1.5">{wipReasonBadges(r)}</td>
                <td className="max-w-[200px] truncate px-2 py-1.5 text-muted">{r.issue_note ?? "-"}</td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    disabled={deletingId === r.id}
                    onClick={() => handleDeleteRow(r)}
                    className="text-muted transition-colors hover:text-danger disabled:opacity-50"
                    title={`Xóa số liệu ngày ${formatDate(r.report_date)}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
