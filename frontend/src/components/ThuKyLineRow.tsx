"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Lock, LockOpen, MessageSquareWarning } from "lucide-react";
import { Badge, Button } from "./ui";
import { LineEntryCard } from "./LineEntryCard";
import { api } from "@/lib/api";
import type { LineDaySummary, LineWithReport } from "@/lib/types";

export function ThuKyLineRow({ summary, reportDate, onChanged }: { summary: LineDaySummary; reportDate: string; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [shift, setShift] = useState(1);
  const [detail, setDetail] = useState<LineWithReport | null>(null);
  const [lockLoading, setLockLoading] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    setDetail(null);
    api.getLineReport(summary.line_id, reportDate, shift).then(setDetail);
  }, [expanded, shift, summary.line_id, reportDate]);

  async function toggleLock() {
    setLockLoading(true);
    try {
      const nextLocked = !(detail?.report?.is_locked ?? summary.is_locked);
      await api.setLockByLine(summary.line_id, reportDate, shift, nextLocked);
      const refreshed = await api.getLineReport(summary.line_id, reportDate, shift);
      setDetail(refreshed);
      onChanged();
    } finally {
      setLockLoading(false);
    }
  }

  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-surface-muted/60">
        <td className="whitespace-nowrap px-4 py-3 font-medium">{summary.line_number}</td>
        <td className="px-4 py-3">
          <Badge tone="primary">{summary.pu_group}</Badge>
        </td>
        <td className="px-4 py-3 text-muted">{summary.executive_name}</td>
        <td className="px-4 py-3 text-muted">{summary.buyer}</td>
        <td className="px-4 py-3 text-muted">{summary.shift_display}</td>
        <td className="px-4 py-3">
          {summary.is_submitted ? <Badge tone="success">Đã nộp</Badge> : <Badge tone="warning">Chưa nộp</Badge>}
        </td>
        <td className="px-4 py-3">
          {summary.is_locked ? (
            <span className="flex items-center gap-1 text-xs text-muted">
              <Lock size={13} /> Đã khoá
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-success">
              <LockOpen size={13} /> Mở
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          {summary.issue_note ? (
            <span className="flex items-center gap-1 text-xs text-danger" title={summary.issue_note}>
              <MessageSquareWarning size={13} />
              <span className="max-w-[180px] truncate">{summary.issue_note}</span>
            </span>
          ) : (
            <span className="text-xs text-muted">-</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <Button variant="secondary" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Quản lý
          </Button>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-border bg-surface-muted/40">
          <td colSpan={9} className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="flex overflow-hidden rounded-lg border border-border">
                {[1, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => setShift(s)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      shift === s ? "bg-primary text-primary-foreground" : "bg-surface text-muted hover:bg-slate-100"
                    }`}
                  >
                    Ca {s}
                  </button>
                ))}
              </div>
              <Button variant={detail?.report?.is_locked ?? summary.is_locked ? "primary" : "secondary"} size="sm" disabled={lockLoading} onClick={toggleLock}>
                {detail?.report?.is_locked ?? summary.is_locked ? (
                  <>
                    <LockOpen size={14} /> Mở khoá Ca {shift}
                  </>
                ) : (
                  <>
                    <Lock size={14} /> Khoá lại Ca {shift}
                  </>
                )}
              </Button>
              <p className="text-xs text-muted">Nhập hộ nếu Tổ trưởng nhờ hỗ trợ, hoặc sửa số liệu bị sai.</p>
            </div>
            {detail ? (
              <LineEntryCard
                item={detail}
                reportDate={reportDate}
                shift={shift}
                onSubmitted={() => {
                  onChanged();
                  api.getLineReport(summary.line_id, reportDate, shift).then(setDetail);
                }}
              />
            ) : (
              <p className="text-sm text-muted">Đang tải...</p>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
