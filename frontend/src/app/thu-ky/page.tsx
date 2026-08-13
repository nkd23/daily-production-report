"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { RequireRole } from "@/components/RequireRole";
import { PageShell } from "@/components/PageShell";
import { ThuKyLineRow } from "@/components/ThuKyLineRow";
import { Button, Card, Input } from "@/components/ui";
import { api } from "@/lib/api";
import type { DashboardResponse } from "@/lib/types";

function todayISO() {
  return new Date().toLocaleDateString("sv-SE");
}

function ThuKyContent() {
  const [reportDate, setReportDate] = useState(todayISO());
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    api.dashboardSummary(reportDate).then(setData);
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

  const notSubmitted = data ? data.lines.filter((l) => !l.is_submitted).length : 0;

  return (
    <PageShell
      title="Theo dõi nộp báo cáo"
      description="Xem line nào đã nộp / chưa nộp trong ngày, mở khoá hoặc nhập hộ khi cần"
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
      {data ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-muted">Tổng số Line</p>
            <p className="mt-1 text-xl font-semibold">{data.kpi.lines_total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted">Đã nộp</p>
            <p className="mt-1 text-xl font-semibold text-success">{data.kpi.lines_submitted}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted">Chưa nộp</p>
            <p className="mt-1 text-xl font-semibold text-warning">{notSubmitted}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted">Line có Issue</p>
            <p className="mt-1 text-xl font-semibold text-danger">{data.kpi.lines_with_issue}</p>
          </Card>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Line</th>
                <th className="px-4 py-3 font-medium">PU</th>
                <th className="px-4 py-3 font-medium">Executive</th>
                <th className="px-4 py-3 font-medium">Buyer</th>
                <th className="px-4 py-3 font-medium">Ca</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Khoá</th>
                <th className="px-4 py-3 font-medium">Issue</th>
                <th className="px-4 py-3 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data?.lines.map((line) => (
                <ThuKyLineRow key={line.line_id} summary={line} reportDate={reportDate} onChanged={load} />
              ))}
              {data && data.lines.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted">
                    Chưa có line nào được cấu hình.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </PageShell>
  );
}

export default function ThuKyPage() {
  return (
    <RequireRole roles={["thu_ky", "sep"]}>
      <ThuKyContent />
    </RequireRole>
  );
}
