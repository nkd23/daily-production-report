"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { PageShell } from "@/components/PageShell";
import { LineEntryCard } from "@/components/LineEntryCard";
import { Input } from "@/components/ui";
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
  const [reportDate, setReportDate] = useState(todayISO());
  const [items, setItems] = useState<LineWithReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .myLines(reportDate)
      .then(setItems)
      .catch(() => setError("Không tải được dữ liệu, vui lòng thử lại"));
  }, [reportDate]);

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
        <Input
          type="date"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          className="w-auto"
        />
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
