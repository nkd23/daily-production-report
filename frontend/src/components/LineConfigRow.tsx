"use client";

import { useState } from "react";
import { Check, Trash, Trash2 } from "lucide-react";
import { Badge, Button, Input, Select } from "./ui";
import { api, ApiError } from "@/lib/api";
import type { Line, PuGroup, User } from "@/lib/types";

export function LineConfigRow({
  line,
  toTruongs,
  onChanged,
}: {
  line: Line;
  toTruongs: User[];
  onChanged: () => void;
}) {
  const [form, setForm] = useState(line);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(line);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // sam/target_output/target_eff have no input in this row anymore (SAM
      // and Target are entered fresh per day by the Tổ trưởng, not edited
      // here) - pass the untouched bootstrap values through unchanged since
      // the API still requires them on every update.
      await api.updateLine(line.id, {
        line_number: form.line_number,
        executive_name: form.executive_name,
        pu_group: form.pu_group,
        sam: Number(form.sam),
        target_output: Number(form.target_output),
        target_eff: Number(form.target_eff),
        to_truong_user_id: form.to_truong_user_id,
        is_active: form.is_active,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lỗi khi lưu");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate() {
    if (!confirm(`Ẩn line ${line.line_number}? Line sẽ không còn hiển thị cho Tổ trưởng/Dashboard.`)) return;
    await api.deactivateLine(line.id);
    onChanged();
  }

  async function deletePermanently() {
    if (
      !confirm(
        `Xóa HẲN line ${line.line_number}? Toàn bộ báo cáo sản lượng và lịch sử chỉnh sửa của line này ở mọi ngày sẽ bị xóa vĩnh viễn, không thể khôi phục.`
      )
    ) {
      return;
    }
    try {
      await api.deleteLinePermanently(line.id);
      onChanged();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Không xóa được line");
    }
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2">
        <Input value={form.line_number} onChange={(e) => setForm({ ...form, line_number: e.target.value })} className="w-24" />
      </td>
      <td className="px-3 py-2">
        <Select value={form.pu_group} onChange={(e) => setForm({ ...form, pu_group: e.target.value as PuGroup })} className="!w-28">
          <option value="PU1">PU1</option>
          <option value="PU2">PU2</option>
        </Select>
      </td>
      <td className="px-3 py-2">
        <Input value={form.executive_name} onChange={(e) => setForm({ ...form, executive_name: e.target.value })} className="w-32" />
      </td>
      <td className="px-3 py-2">
        <Select
          value={form.to_truong_user_id ?? ""}
          onChange={(e) => setForm({ ...form, to_truong_user_id: e.target.value ? Number(e.target.value) : null })}
          className="w-40"
        >
          <option value="">-- Chưa gán --</option>
          {toTruongs.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-3 py-2">{form.is_active ? <Badge tone="success">Hoạt động</Badge> : <Badge tone="default">Đã ẩn</Badge>}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {error ? <span className="text-xs text-danger">{error}</span> : null}
          {dirty ? (
            <Button size="sm" disabled={saving} onClick={save}>
              <Check size={14} /> Lưu
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={deactivate} title="Ẩn line">
            <Trash2 size={14} className="text-danger" />
          </Button>
          <Button size="sm" variant="ghost" onClick={deletePermanently} title="Xóa hẳn line (không thể khôi phục)">
            <Trash size={14} className="text-danger" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
