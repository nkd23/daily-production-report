"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, Pencil, Send, X } from "lucide-react";
import { Badge, Button, Input, Label, Textarea } from "./ui";
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

const emptyForm: DailyReportInput = {
  shift: 1,
  buyer: "",
  out_sew: null,
  eff_sew: null,
  out_fin_scanpack: null,
  out_fin_fin: null,
  eff_fin: null,
  wip_fin: null,
  issue_note: "",
};

export function LineEntryCard({
  item,
  reportDate,
  shift,
  onSubmitted,
}: {
  item: LineWithReport;
  reportDate: string;
  shift: number;
  onSubmitted: () => void;
}) {
  const { line, report, is_editable } = item;
  const [form, setForm] = useState<DailyReportInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const [editingTargets, setEditingTargets] = useState(false);
  const [targetForm, setTargetForm] = useState({
    sam: String(line.sam || ""),
    target_output: String(line.target_output || ""),
    target_eff: String(line.target_eff || ""),
  });
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  function openTargetEdit() {
    setTargetForm({
      sam: String(line.sam || ""),
      target_output: String(line.target_output || ""),
      target_eff: String(line.target_eff || ""),
    });
    setTargetError(null);
    setEditingTargets(true);
  }

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
      await api.updateLineTargets(line.id, { sam, target_output, target_eff });
      setEditingTargets(false);
      onSubmitted();
    } catch (err) {
      setTargetError(err instanceof ApiError ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setTargetSaving(false);
    }
  }

  useEffect(() => {
    setForm(
      report
        ? {
            shift,
            buyer: report.buyer ?? "",
            out_sew: report.out_sew,
            eff_sew: report.eff_sew,
            out_fin_scanpack: report.out_fin_scanpack,
            out_fin_fin: report.out_fin_fin,
            eff_fin: report.eff_fin,
            wip_fin: report.wip_fin,
            issue_note: report.issue_note ?? "",
          }
        : { ...emptyForm, shift }
    );
    setJustSaved(false);
    setError(null);
  }, [report, shift]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.submitReport(line.id, reportDate, form);
      setJustSaved(true);
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  }

  const submitted = report?.is_submitted ?? false;
  const locked = !is_editable;

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm shadow-slate-200/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{line.line_number}</h3>
            <Badge tone="primary">{line.pu_group}</Badge>
            <span className="text-sm text-muted">{line.executive_name}</span>
          </div>
          {editingTargets ? (
            <form onSubmit={handleSaveTargets} className="mt-2 flex flex-wrap items-end gap-2">
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
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditingTargets(false)}>
                <X size={14} />
              </Button>
              {targetError ? <p className="w-full text-xs text-danger">{targetError}</p> : null}
            </form>
          ) : (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
              SAM {line.sam}
              {line.target_output > 0 ? ` · Target ${line.target_output.toLocaleString("vi-VN")} sp` : ""}
              {line.target_eff > 0 ? ` · Target EFF ${line.target_eff}%` : ""}
              <button
                type="button"
                onClick={openTargetEdit}
                className="text-muted transition-colors hover:text-foreground"
                title="Cập nhật SAM / Target (theo họp với Sếp)"
              >
                <Pencil size={12} />
              </button>
            </p>
          )}
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

      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <Label>Buyer *</Label>
          <Input
            required
            disabled={locked}
            value={form.buyer}
            onChange={(e) => setForm({ ...form, buyer: e.target.value.toUpperCase() })}
            placeholder="VD: NIKE"
            className="uppercase placeholder:normal-case"
          />
        </div>
        <div>
          <Label>OUT-SEW (SL May+OT)</Label>
          <Input
            type="number"
            min={0}
            disabled={locked}
            value={toFieldValue(form.out_sew)}
            onChange={(e) => setForm({ ...form, out_sew: parseNumber(e.target.value) })}
          />
        </div>
        <div>
          <Label>EFF-SEW (%)</Label>
          <Input
            type="number"
            min={0}
            step="0.1"
            disabled={locked}
            value={toFieldValue(form.eff_sew)}
            onChange={(e) => setForm({ ...form, eff_sew: parseNumber(e.target.value) })}
          />
        </div>
        <div>
          <Label>OUT-FIN (ScanPack)</Label>
          <Input
            type="number"
            min={0}
            disabled={locked}
            value={toFieldValue(form.out_fin_scanpack)}
            onChange={(e) => setForm({ ...form, out_fin_scanpack: parseNumber(e.target.value) })}
          />
        </div>
        <div>
          <Label>OUT-FIN (Fin)</Label>
          <Input
            type="number"
            min={0}
            disabled={locked}
            value={toFieldValue(form.out_fin_fin)}
            onChange={(e) => setForm({ ...form, out_fin_fin: parseNumber(e.target.value) })}
          />
        </div>
        <div>
          <Label>EFF-FIN (%)</Label>
          <Input
            type="number"
            min={0}
            step="0.1"
            disabled={locked}
            value={toFieldValue(form.eff_fin)}
            onChange={(e) => setForm({ ...form, eff_fin: parseNumber(e.target.value) })}
          />
        </div>
        <div>
          <Label>WIP FIN</Label>
          <Input
            type="number"
            min={0}
            disabled={locked}
            value={toFieldValue(form.wip_fin)}
            onChange={(e) => setForm({ ...form, wip_fin: parseNumber(e.target.value) })}
          />
        </div>

        <div className="col-span-2 sm:col-span-3 lg:col-span-4">
          <Label>Issue / Lí do (không bắt buộc)</Label>
          <Textarea
            rows={2}
            disabled={locked}
            value={form.issue_note ?? ""}
            onChange={(e) => setForm({ ...form, issue_note: e.target.value })}
            placeholder="VD: thiếu nguyên liệu, máy hỏng, thiếu chuyền..."
          />
        </div>

        <div className="col-span-2 flex flex-col justify-end gap-2 sm:col-span-3 lg:col-span-2">
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          {justSaved && !error ? <p className="text-xs text-success">Đã lưu thành công</p> : null}
          <Button type="submit" disabled={locked || saving} className="w-full">
            <Send size={15} />
            {saving ? "Đang nộp..." : "Nộp báo cáo"}
          </Button>
          {locked ? <p className="text-xs text-muted">Liên hệ Thư ký để mở khoá nếu cần sửa.</p> : null}
        </div>
      </form>
    </div>
  );
}
