"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, RefreshCw, Save } from "lucide-react";
import { RequireRole } from "@/components/RequireRole";
import { PageShell } from "@/components/PageShell";
import { Badge, Button, Card, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { execColor } from "@/lib/exec-colors";
import type { LineTargetRow } from "@/lib/types";

function todayISO() {
  return new Date().toLocaleDateString("sv-SE");
}

function ddmmyyyy(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

type Draft = { target_output: string; target_eff: string };

function draftOf(row: LineTargetRow): Draft {
  return {
    target_output: row.target_output != null ? String(row.target_output) : "",
    target_eff: row.target_eff != null ? String(row.target_eff) : "",
  };
}

function TargetContent() {
  const { user } = useAuth();
  const [fromDate, setFromDate] = useState(todayISO());
  const [rows, setRows] = useState<LineTargetRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [invalid, setInvalid] = useState<Set<number>>(new Set());

  const load = useCallback(() => {
    setRows(null);
    api.listTargets(fromDate).then((data) => {
      setRows(data);
      setDrafts(Object.fromEntries(data.map((r) => [r.line_id, draftOf(r)])));
      setInvalid(new Set());
    });
  }, [fromDate]);

  useEffect(() => {
    load();
  }, [load]);

  const changed = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      const d = drafts[r.line_id];
      const orig = draftOf(r);
      return d && (d.target_output !== orig.target_output || d.target_eff !== orig.target_eff);
    });
  }, [rows, drafts]);

  async function handleSave() {
    setMessage(null);
    const bad = new Set<number>();
    for (const r of changed) {
      const d = drafts[r.line_id];
      const out = Number(d.target_output);
      const eff = Number(d.target_eff);
      if (!Number.isInteger(out) || out <= 0 || !(eff > 0 && eff <= 200)) bad.add(r.line_id);
    }
    setInvalid(bad);
    if (bad.size) {
      setMessage({ tone: "danger", text: "Target sản lượng phải là số nguyên lớn hơn 0, target hiệu suất từ 0 đến 200%." });
      return;
    }
    setSaving(true);
    let done = 0;
    try {
      for (const r of changed) {
        const d = drafts[r.line_id];
        await api.setTarget(r.line_id, {
          target_output: Number(d.target_output),
          target_eff: Number(d.target_eff),
          effective_from: fromDate,
        });
        done++;
      }
      setMessage({ tone: "success", text: `Đã lưu target ${done} line, áp dụng từ ${ddmmyyyy(fromDate)}.` });
      load();
    } catch (err) {
      setMessage({
        tone: "danger",
        text: `Đã lưu ${done}/${changed.length} line. Lỗi: ${err instanceof ApiError ? err.message : "vui lòng thử lại"}`,
      });
      load();
    } finally {
      setSaving(false);
    }
  }

  const noTarget = rows?.filter((r) => r.target_output == null).length ?? 0;

  return (
    <PageShell
      title="Target"
      description={
        user?.role === "executive"
          ? `Target sản lượng và hiệu suất các line của ${user.executive_name ?? "bạn"}`
          : "Target sản lượng và hiệu suất của từng line"
      }
      actions={
        <>
          <label className="flex items-center gap-2 text-sm text-muted">
            Áp dụng từ
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => e.target.value && setFromDate(e.target.value)}
              className="flex-none basis-44"
            />
          </label>
          <Button variant="secondary" size="sm" onClick={load} disabled={saving}>
            <RefreshCw size={14} /> Làm mới
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || changed.length === 0}>
            <Save size={14} /> {saving ? "Đang lưu..." : `Lưu thay đổi${changed.length ? ` (${changed.length})` : ""}`}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary-soft/40 px-4 py-3 text-xs text-muted">
        <Info size={15} className="mt-0.5 shrink-0 text-primary" />
        <p>
          Bảng hiển thị target đang áp dụng vào ngày <span className="font-medium text-foreground">{ddmmyyyy(fromDate)}</span>.
          Sửa số rồi bấm <span className="font-medium text-foreground">Lưu thay đổi</span>: target mới áp dụng từ ngày đã chọn trở về
          sau (cho đến lần đổi tiếp theo), báo cáo các ngày trước đó giữ nguyên. Tổ trưởng không nhìn thấy target.
        </p>
      </div>

      {message ? (
        <p className={`mb-4 text-sm ${message.tone === "success" ? "text-success" : "text-danger"}`}>{message.text}</p>
      ) : null}

      <Card className="overflow-hidden p-0">
        {!rows ? (
          <p className="p-6 text-sm text-muted">Đang tải...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">Line</th>
                  <th className="px-4 py-2 font-medium">Executive</th>
                  <th className="px-4 py-2 font-medium">Target SL</th>
                  <th className="px-4 py-2 font-medium">Target EFF (%)</th>
                  <th className="px-4 py-2 font-medium">Đang áp dụng từ</th>
                  <th className="px-4 py-2 font-medium">Người đặt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const d = drafts[r.line_id] ?? draftOf(r);
                  const isChanged = changed.some((c) => c.line_id === r.line_id);
                  const bad = invalid.has(r.line_id) ? "border-danger ring-2 ring-danger/20" : "";
                  return (
                    <tr
                      key={r.line_id}
                      className={`border-b border-border last:border-0 ${isChanged ? "bg-warning-soft/40" : ""}`}
                    >
                      <td className="whitespace-nowrap px-4 py-2 font-medium">
                        <span className="flex items-center gap-2">
                          {r.line_number}
                          <Badge tone={r.pu_group === "PU1" ? "pu1" : "pu2"}>{r.pu_group}</Badge>
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: execColor(r.executive_name).solid }}
                          />
                          {r.executive_name}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={d.target_output}
                          disabled={saving}
                          onChange={(e) => setDrafts({ ...drafts, [r.line_id]: { ...d, target_output: e.target.value } })}
                          className={`w-28 ${bad}`}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          min={1}
                          step="0.1"
                          inputMode="decimal"
                          value={d.target_eff}
                          disabled={saving}
                          onChange={(e) => setDrafts({ ...drafts, [r.line_id]: { ...d, target_eff: e.target.value } })}
                          className={`w-24 ${bad}`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-muted">
                        {r.effective_from ? (
                          ddmmyyyy(r.effective_from)
                        ) : r.target_output != null ? (
                          <span title="Chưa đặt trên trang này - đang lấy target của báo cáo gần nhất">Theo báo cáo cũ</span>
                        ) : (
                          <Badge tone="warning">Chưa có target</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted">{r.set_by_name ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {noTarget > 0 ? (
        <p className="mt-3 text-xs text-warning">
          {noTarget} line chưa có target - Dashboard sẽ không tính % hoàn thành cho các line này.
        </p>
      ) : null}
    </PageShell>
  );
}

export default function TargetPage() {
  return (
    <RequireRole roles={["thu_ky", "sep", "executive"]}>
      <TargetContent />
    </RequireRole>
  );
}
