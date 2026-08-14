"use client";

import { useEffect, useState } from "react";
import { History, Trash2, ClipboardEdit, SlidersHorizontal } from "lucide-react";
import { Card } from "./ui";
import { api } from "@/lib/api";
import type { ReportHistoryEntry, ReportHistoryValues } from "@/lib/types";

const FIELD_LABELS: Record<keyof ReportHistoryValues, string> = {
  buyer: "Buyer",
  sam: "SAM",
  target_output: "Target sản lượng",
  target_eff: "Target hiệu suất",
  out_sew: "OUT-SEW",
  eff_sew: "EFF-SEW (%)",
  out_fin_scanpack: "OUT-FIN (ScanPack)",
  out_fin_fin: "OUT-FIN (Fin)",
  eff_fin: "EFF-FIN (%)",
  wip_dip: "Tồn Dip",
  wip_pre_pi: "Tồn trước PI",
  issue_note: "Issue / Lí do",
};

const ACTION_LABEL: Record<ReportHistoryEntry["action"], string> = {
  submit: "Nộp báo cáo",
  target_update: "Cập nhật SAM/Target",
  delete: "Xóa báo cáo",
};

const ACTION_ICON: Record<ReportHistoryEntry["action"], typeof ClipboardEdit> = {
  submit: ClipboardEdit,
  target_update: SlidersHorizontal,
  delete: Trash2,
};

function fmt(v: string | number | null): string {
  if (v === null || v === undefined || v === "") return "trống";
  return String(v);
}

function diffFields(entry: ReportHistoryEntry): { field: string; before: string; after: string }[] {
  const keys = Object.keys(FIELD_LABELS) as (keyof ReportHistoryValues)[];
  const rows: { field: string; before: string; after: string }[] = [];
  for (const key of keys) {
    const before = entry.old_values?.[key] ?? null;
    const after = entry.new_values?.[key] ?? null;
    if (before === after) continue;
    rows.push({ field: FIELD_LABELS[key], before: fmt(before), after: fmt(after) });
  }
  return rows;
}

function formatDateTime(iso: string) {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z").toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReportHistoryPanel({ lineId, reportDate }: { lineId: number; reportDate: string }) {
  const [entries, setEntries] = useState<ReportHistoryEntry[] | null>(null);

  useEffect(() => {
    setEntries(null);
    api.getReportHistory(lineId, reportDate).then(setEntries);
  }, [lineId, reportDate]);

  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <History size={15} /> Lịch sử thay đổi ngày {reportDate.split("-").reverse().join("/")}
      </h3>

      {entries === null ? (
        <p className="text-sm text-muted">Đang tải...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">Chưa có thay đổi nào được ghi nhận cho ngày này.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => {
            const Icon = ACTION_ICON[entry.action];
            const changes = diffFields(entry);
            return (
              <li key={entry.id} className="rounded-lg border border-border bg-surface-muted p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Icon size={13} className={entry.action === "delete" ? "text-danger" : "text-primary"} />
                    {ACTION_LABEL[entry.action]}
                  </span>
                  <span className="text-muted">
                    {entry.changed_by_name ?? "?"} · {formatDateTime(entry.changed_at)}
                  </span>
                </div>
                {changes.length > 0 ? (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <tbody>
                        {changes.map((c) => (
                          <tr key={c.field} className="border-t border-border/60 first:border-t-0">
                            <td className="py-1 pr-3 text-muted">{c.field}</td>
                            <td className="py-1 pr-2 text-danger line-through">{c.before}</td>
                            <td className="py-1 text-success">{c.after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
