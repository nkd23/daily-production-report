"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Input, Label, Select } from "./ui";
import { api, ApiError } from "@/lib/api";
import type { PuGroup, User } from "@/lib/types";

const emptyState = {
  line_number: "",
  executive_name: "",
  pu_group: "PU1" as PuGroup,
  sam: 0,
  target_output: 0,
  target_eff: 0,
  to_truong_user_id: null as number | null,
  is_active: true,
  display_order: 0,
};

export function AddLineForm({ toTruongs, onCreated }: { toTruongs: User[]; onCreated: () => void }) {
  const [form, setForm] = useState(emptyState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createLine(form);
      setForm(emptyState);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể tạo line");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      <div>
        <Label>Line</Label>
        <Input required value={form.line_number} onChange={(e) => setForm({ ...form, line_number: e.target.value })} placeholder="Line 6" />
      </div>
      <div>
        <Label>PU</Label>
        <Select value={form.pu_group} onChange={(e) => setForm({ ...form, pu_group: e.target.value as PuGroup })}>
          <option value="PU1">PU1</option>
          <option value="PU2">PU2</option>
        </Select>
      </div>
      <div>
        <Label>Executive</Label>
        <Input required value={form.executive_name} onChange={(e) => setForm({ ...form, executive_name: e.target.value })} placeholder="Ms Thảo" />
      </div>
      <div>
        <Label>SAM</Label>
        <Input required type="number" step="0.1" value={form.sam} onChange={(e) => setForm({ ...form, sam: Number(e.target.value) })} />
      </div>
      <div>
        <Label>Target Out</Label>
        <Input required type="number" value={form.target_output} onChange={(e) => setForm({ ...form, target_output: Number(e.target.value) })} />
      </div>
      <div>
        <Label>Target EFF</Label>
        <Input required type="number" step="0.1" value={form.target_eff} onChange={(e) => setForm({ ...form, target_eff: Number(e.target.value) })} />
      </div>
      <div>
        <Label>Tổ trưởng</Label>
        <Select
          value={form.to_truong_user_id ?? ""}
          onChange={(e) => setForm({ ...form, to_truong_user_id: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">-- Chưa gán --</option>
          {toTruongs.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </Select>
      </div>

      <div className="col-span-2 flex items-end gap-2 sm:col-span-4 lg:col-span-8">
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <Button type="submit" disabled={saving} size="sm">
          <Plus size={14} /> {saving ? "Đang thêm..." : "Thêm Line"}
        </Button>
      </div>
    </form>
  );
}
