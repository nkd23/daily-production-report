"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { PageShell } from "@/components/PageShell";
import { LineEntryCard } from "@/components/LineEntryCard";
import { api } from "@/lib/api";
import type { LineWithReport } from "@/lib/types";

function todayISO() {
  return new Date().toLocaleDateString("sv-SE"); // yyyy-mm-dd, local time
}

function formatVietnameseDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function ToTruongContent() {
  const reportDate = todayISO();
  const [shift, setShift] = useState(1);
  const [items, setItems] = useState<LineWithReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .myLines(reportDate, shift)
      .then(setItems)
      .catch(() => setError("Không tải được dữ liệu, vui lòng thử lại"));
  }, [reportDate, shift]);

  useEffect(() => {
    load();
  }, [load]);

  const submittedCount = items?.filter((i) => i.report?.is_submitted).length ?? 0;
  const total = items?.length ?? 0;

  return (
    <PageShell
      title="Nhập sản lượng"
      description={`${formatVietnameseDate(reportDate)} · Đã nộp ${submittedCount}/${total} line`}
      actions={
        <div className="flex overflow-hidden rounded-lg border border-border">
          {[1, 2].map((s) => (
            <button
              key={s}
              onClick={() => setShift(s)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                shift === s ? "bg-primary text-primary-foreground" : "bg-surface text-muted hover:bg-slate-100"
              }`}
            >
              Ca {s}
            </button>
          ))}
        </div>
      }
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      {items === null ? (
        <p className="text-sm text-muted">Đang tải...</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-muted p-10 text-center text-sm text-muted">
          Bạn chưa được phân công phụ trách line nào. Liên hệ Thư ký để được gán line.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((item) => (
            <LineEntryCard
              key={item.line.id}
              item={item}
              reportDate={reportDate}
              shift={shift}
              onSubmitted={load}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

export default function ToTruongPage() {
  return (
    <RequireRole roles={["to_truong"]}>
      <ToTruongContent />
    </RequireRole>
  );
}
