"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, Send, Trash2, X } from "lucide-react";
import { Badge, Button, Input, Label, Textarea } from "./ui";
import { BuyerInput } from "./BuyerInput";
import { SubmissionHistory } from "./SubmissionHistory";
import { api, ApiError } from "@/lib/api";
import type { DailyReportInput, LineWithReport } from "@/lib/types";

function toFieldValue(v: number | null): string {
  return v === null || v === undefined ? "" : String(v);
}

function parseNumber(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// Arrow keys move focus to the previous/next field within the same <form>,
// spreadsheet-style, instead of their native behavior (nudging a number
// input's value on Up/Down, moving the caret on Left/Right) - selects the
// destination field's contents so typing immediately replaces it. Left/Right
// only jump fields on a number input (its caret position isn't readable via
// selectionStart/selectionEnd, so there's no in-field editing to preserve);
// on a text field they still move the caret normally until it's already at
// the start/end, matching how spreadsheets behave.
function handleArrowFieldNav(e: React.KeyboardEvent<HTMLElement>) {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") return;

  const forward = e.key === "ArrowDown" || e.key === "ArrowRight";
  const backward = e.key === "ArrowUp" || e.key === "ArrowLeft";
  if (!forward && !backward) return;

  const isHorizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";
  if (isHorizontal && target.type !== "number") {
    const atStart = target.selectionStart === 0 && target.selectionEnd === 0;
    const atEnd = target.selectionStart === target.value.length && target.selectionEnd === target.value.length;
    if ((e.key === "ArrowLeft" && !atStart) || (e.key === "ArrowRight" && !atEnd)) return;
  }

  const form = target.closest("form");
  if (!form) return;
  const focusables = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input:not([type=hidden]):not(:disabled), textarea:not(:disabled)"
    )
  );
  const idx = focusables.indexOf(target);
  if (idx === -1) return;
  const next = focusables[forward ? idx + 1 : idx - 1];
  if (next) {
    e.preventDefault();
    next.focus();
    next.select();
  }
}

const emptyForm: DailyReportInput = {
  shift_count: 1,
  buyer: "",
  out_sew: null,
  eff_sew: null,
  out_fin_scanpack: null,
  out_fin_fin: null,
  eff_fin: null,
  wip_dip: null,
  wip_pre_pi: null,
  wip_reason_machine: false,
  wip_reason_line_spread: false,
  wip_reason_semi_finished: false,
  issue_note: "",
};

export function LineEntryCard({
  item,
  reportDate,
  onSubmitted,
}: {
  item: LineWithReport;
  reportDate: string;
  onSubmitted: () => void;
}) {
  const { line, report, is_editable } = item;
  const [form, setForm] = useState<DailyReportInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorFields, setErrorFields] = useState<Set<keyof DailyReportInput>>(new Set());
  const [justSaved, setJustSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const [targetForm, setTargetForm] = useState({
    sam: String(line.sam || ""),
    target_output: String(line.target_output || ""),
    target_eff: String(line.target_eff || ""),
  });
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  function resetTargetForm() {
    setTargetForm({
      sam: String(line.sam || ""),
      target_output: String(line.target_output || ""),
      target_eff: String(line.target_eff || ""),
    });
    setTargetError(null);
  }

  // Re-sync whenever a different line/date's values come in (e.g. switching
  // the report date, or right after a save refetches the line).
  useEffect(() => {
    resetTargetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.id, line.sam, line.target_output, line.target_eff]);

  async function handleSaveTargets(e: React.FormEvent) {
    e.preventDefault();
    const sam = Number(targetForm.sam);
    const target_output = Number(targetForm.target_output);
    const target_eff = Number(targetForm.target_eff);
    if (!sam || !target_output || !target_eff) {
      setTargetError("Vui lòng nhập đủ SAM, Target sản lượng và Target hiệu suất");
      return;
    }
    setTargetSaving(true);
    setTargetError(null);
    try {
      await api.updateLineTargets(line.id, reportDate, { sam, target_output, target_eff });
      onSubmitted();
    } catch (err) {
      setTargetError(err instanceof ApiError ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setTargetSaving(false);
    }
  }

  // Keyed on line/date only (not the `report` object itself) - saving just
  // the SAM/Target above refetches the line list and hands down a brand new
  // `report` object (created by update_line_targets, output fields still
  // null) even though the Tổ trưởng hasn't touched output yet. Re-syncing on
  // every such refetch would wipe out whatever they'd already typed below
  // before getting to SAM. Switching to a genuinely different line or date
  // still needs a full reset, which this still does.
  useEffect(() => {
    setForm(
      report
        ? {
            shift_count: report.shift_count,
            buyer: report.buyer ?? "",
            out_sew: report.out_sew,
            eff_sew: report.eff_sew,
            out_fin_scanpack: report.out_fin_scanpack,
            out_fin_fin: report.out_fin_fin,
            eff_fin: report.eff_fin,
            wip_dip: report.wip_dip,
            wip_pre_pi: report.wip_pre_pi,
            wip_reason_machine: report.wip_reason_machine,
            wip_reason_line_spread: report.wip_reason_line_spread,
            wip_reason_semi_finished: report.wip_reason_semi_finished,
            issue_note: report.issue_note ?? "",
          }
        : { ...emptyForm }
    );
    setJustSaved(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.id, reportDate]);

  // Every numeric field must be filled in (0 if there's truly no data for the
  // day). An explicit 0 on EFF-SEW/EFF-FIN is still excluded from the
  // dashboard's weighted EFF average, same as a blank used to be (see
  // app.services.aggregation.build_line_summaries's eff_*_weight) - so
  // requiring 0 here doesn't skew that calculation.
  const REQUIRED_NUMERIC_FIELDS: { key: keyof DailyReportInput; label: string }[] = [
    { key: "out_sew", label: "OUT-SEW" },
    { key: "eff_sew", label: "EFF-SEW" },
    { key: "out_fin_scanpack", label: "OUT-FIN (ScanPack)" },
    { key: "out_fin_fin", label: "OUT-FIN (Fin)" },
    { key: "eff_fin", label: "EFF-FIN" },
    { key: "wip_dip", label: "Tồn Dip" },
    { key: "wip_pre_pi", label: "Tồn trước PI" },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorFields(new Set());
    const missing = REQUIRED_NUMERIC_FIELDS.filter((f) => form[f.key] === null);
    if (missing.length > 0) {
      setError(`Vui lòng nhập đủ các ô sau (nhập 0 nếu không có số liệu): ${missing.map((f) => f.label).join(", ")}`);
      setErrorFields(new Set(missing.map((f) => f.key)));
      return;
    }
    if ((form.out_fin_fin === 0) !== (form.eff_fin === 0)) {
      setError("Vui lòng kiểm tra lại số liệu.");
      setErrorFields(new Set(["out_fin_fin", "eff_fin"]));
      return;
    }
    const hasWip = (form.wip_dip ?? 0) > 0 || (form.wip_pre_pi ?? 0) > 0;
    if (hasWip) {
      const anyReasonChecked = form.wip_reason_machine || form.wip_reason_line_spread || form.wip_reason_semi_finished;
      const noteEmpty = !form.issue_note || form.issue_note.trim() === "";
      if (!anyReasonChecked || noteEmpty) {
        setError("Vui lòng nhập lý do tồn.");
        setErrorFields(
          new Set([
            ...(!anyReasonChecked ? (["wip_reason_machine", "wip_reason_line_spread", "wip_reason_semi_finished"] as const) : []),
            ...(noteEmpty ? (["issue_note"] as const) : []),
          ])
        );
        return;
      }
    }
    setSaving(true);
    try {
      await api.submitReport(line.id, reportDate, form);
      setJustSaved(true);
      setHistoryVersion((v) => v + 1);
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  }

  const submitted = report?.is_submitted ?? false;
  const locked = !is_editable;
  const targetMissing = line.sam === 0 || line.target_output === 0 || line.target_eff === 0;

  async function handleDelete() {
    if (!window.confirm(`Xóa toàn bộ số liệu đã nhập cho line ${line.line_number} ngày này?\nKhông thể hoàn tác.`)) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await api.deleteReport(line.id, reportDate);
      setForm({ ...emptyForm });
      setHistoryVersion((v) => v + 1);
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không xóa được, vui lòng thử lại");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm shadow-slate-200/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{line.line_number}</h3>
            <Badge tone={line.pu_group === "PU1" ? "pu1" : "pu2"}>{line.pu_group}</Badge>
            <span className="text-sm text-muted">{line.executive_name}</span>
          </div>
          <form onSubmit={handleSaveTargets} onKeyDown={handleArrowFieldNav} className="mt-2 flex flex-wrap items-end gap-2">
            <div>
              <Label>SAM</Label>
              <Input
                type="number"
                min={0}
                step="0.1"
                className="w-24"
                value={targetForm.sam}
                onChange={(e) => setTargetForm({ ...targetForm, sam: e.target.value })}
              />
            </div>
            <div>
              <Label>Target sản lượng</Label>
              <Input
                type="number"
                min={0}
                className="w-28"
                value={targetForm.target_output}
                onChange={(e) => setTargetForm({ ...targetForm, target_output: e.target.value })}
              />
            </div>
            <div>
              <Label>Target hiệu suất (%)</Label>
              <Input
                type="number"
                min={0}
                step="0.1"
                className="w-24"
                value={targetForm.target_eff}
                onChange={(e) => setTargetForm({ ...targetForm, target_eff: e.target.value })}
              />
            </div>
            <Button type="submit" size="sm" disabled={targetSaving}>
              {targetSaving ? "Đang lưu..." : "Lưu"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={resetTargetForm} title="Hoàn tác thay đổi chưa lưu">
              <X size={14} />
            </Button>
            {targetError ? <p className="w-full text-xs text-danger">{targetError}</p> : null}
          </form>
        </div>
        <div className="flex items-center gap-2">
          {locked ? (
            <Badge tone="default">
              <span className="flex items-center gap-1">
                <Lock size={12} /> Đã khoá
              </span>
            </Badge>
          ) : submitted ? (
            <Badge tone="success">
              <span className="flex items-center gap-1">
                <CheckCircle2 size={12} /> Đã nộp
              </span>
            </Badge>
          ) : (
            <Badge tone="warning">
              <span className="flex items-center gap-1">
                <AlertTriangle size={12} /> Chưa nộp
              </span>
            </Badge>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} onKeyDown={handleArrowFieldNav} className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <Label>Buyer *</Label>
          <BuyerInput
            disabled={locked}
            value={form.buyer}
            onChange={(buyer) => setForm({ ...form, buyer })}
          />
        </div>
        <div>
          <Label>Số ca chạy</Label>
          <div className="flex overflow-hidden rounded-lg border border-border">
            {[1, 2].map((s) => (
              <button
                key={s}
                type="button"
                disabled={locked}
                onClick={() => setForm({ ...form, shift_count: s })}
                className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  form.shift_count === s ? "bg-primary text-primary-foreground" : "bg-surface text-muted hover:bg-slate-100"
                }`}
              >
                {s} ca
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>OUT-SEW (SL May+OT) *</Label>
          <Input
            type="number"
            min={0}
            disabled={locked}
            value={toFieldValue(form.out_sew)}
            onChange={(e) => {
              setForm({ ...form, out_sew: parseNumber(e.target.value) });
              setErrorFields(new Set());
            }}
            className={errorFields.has("out_sew") ? "border-danger ring-2 ring-danger/20" : ""}
          />
        </div>
        <div>
          <Label>EFF-SEW (%) *</Label>
          <Input
            type="number"
            min={0}
            step="0.1"
            disabled={locked}
            value={toFieldValue(form.eff_sew)}
            onChange={(e) => {
              setForm({ ...form, eff_sew: parseNumber(e.target.value) });
              setErrorFields(new Set());
            }}
            className={errorFields.has("eff_sew") ? "border-danger ring-2 ring-danger/20" : ""}
          />
        </div>
        <div>
          <Label>OUT-FIN (ScanPack) *</Label>
          <Input
            type="number"
            min={0}
            disabled={locked}
            value={toFieldValue(form.out_fin_scanpack)}
            onChange={(e) => {
              setForm({ ...form, out_fin_scanpack: parseNumber(e.target.value) });
              setErrorFields(new Set());
            }}
            className={errorFields.has("out_fin_scanpack") ? "border-danger ring-2 ring-danger/20" : ""}
          />
        </div>
        <div>
          <Label>OUT-FIN (Fin) *</Label>
          <Input
            type="number"
            min={0}
            disabled={locked}
            value={toFieldValue(form.out_fin_fin)}
            onChange={(e) => {
              setForm({ ...form, out_fin_fin: parseNumber(e.target.value) });
              setErrorFields(new Set());
            }}
            className={errorFields.has("out_fin_fin") ? "border-danger ring-2 ring-danger/20" : ""}
          />
        </div>
        <div>
          <Label>EFF-FIN (%) *</Label>
          <Input
            type="number"
            min={0}
            step="0.1"
            disabled={locked}
            value={toFieldValue(form.eff_fin)}
            onChange={(e) => {
              setForm({ ...form, eff_fin: parseNumber(e.target.value) });
              setErrorFields(new Set());
            }}
            className={errorFields.has("eff_fin") ? "border-danger ring-2 ring-danger/20" : ""}
          />
        </div>
        <div>
          <Label>Tồn Dip *</Label>
          <Input
            type="number"
            min={0}
            disabled={locked}
            value={toFieldValue(form.wip_dip)}
            onChange={(e) => {
              setForm({ ...form, wip_dip: parseNumber(e.target.value) });
              setErrorFields(new Set());
            }}
            className={errorFields.has("wip_dip") ? "border-danger ring-2 ring-danger/20" : ""}
          />
        </div>
        <div>
          <Label>Tồn trước PI *</Label>
          <Input
            type="number"
            min={0}
            disabled={locked}
            value={toFieldValue(form.wip_pre_pi)}
            onChange={(e) => {
              setForm({ ...form, wip_pre_pi: parseNumber(e.target.value) });
              setErrorFields(new Set());
            }}
            className={errorFields.has("wip_pre_pi") ? "border-danger ring-2 ring-danger/20" : ""}
          />
        </div>

        <div className="col-span-2 sm:col-span-3 lg:col-span-2">
          <Label>Lý do tồn {(form.wip_dip ?? 0) > 0 || (form.wip_pre_pi ?? 0) > 0 ? "*" : ""}</Label>
          <div
            className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg pt-1 ${
              errorFields.has("wip_reason_machine") ? "ring-2 ring-danger/30" : ""
            }`}
          >
            {(
              [
                { key: "wip_reason_machine", label: "Do máy" },
                { key: "wip_reason_line_spread", label: "Rải chuyền" },
                { key: "wip_reason_semi_finished", label: "Bán thành phẩm" },
              ] as const
            ).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={form[key]}
                  onChange={(e) => {
                    setForm({ ...form, [key]: e.target.checked });
                    setErrorFields(new Set());
                  }}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="col-span-2 sm:col-span-3 lg:col-span-4">
          <Label>Issue / Lí do</Label>
          <Textarea
            rows={2}
            disabled={locked}
            value={form.issue_note ?? ""}
            onChange={(e) => {
              setForm({ ...form, issue_note: e.target.value });
              setErrorFields(new Set());
            }}
            placeholder="VD: thiếu nguyên liệu, máy hỏng, thiếu chuyền..."
            className={errorFields.has("issue_note") ? "border-danger ring-2 ring-danger/20" : ""}
          />
        </div>

        <div className="col-span-2 flex flex-col justify-end gap-2 sm:col-span-3 lg:col-span-2">
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          {justSaved && !error ? <p className="text-xs text-success">Đã lưu thành công</p> : null}
          {!locked && targetMissing ? (
            <p className="text-xs text-danger">Cần nhập SAM/Target trước khi nộp báo cáo.</p>
          ) : null}
          <Button type="submit" disabled={locked || saving || targetMissing} className="w-full">
            <Send size={15} />
            {saving ? "Đang nộp..." : "Nộp báo cáo"}
          </Button>
          {submitted && !locked ? (
            <Button
              type="button"
              variant="secondary"
              disabled={deleting}
              onClick={handleDelete}
              className="w-full"
            >
              <Trash2 size={14} />
              {deleting ? "Đang xóa..." : "Xóa & nhập lại"}
            </Button>
          ) : null}
          {locked ? <p className="text-xs text-muted">Liên hệ Thư ký để mở khoá nếu cần sửa.</p> : null}
        </div>
      </form>

      <SubmissionHistory lineId={line.id} version={historyVersion} onDeleted={onSubmitted} />
    </div>
  );
}
