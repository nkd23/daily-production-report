"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Input, Label, Select } from "./ui";
import { api, ApiError } from "@/lib/api";
import type { PuGroup, User } from "@/lib/types";

// sam/target_output/target_eff have no input here anymore - SAM and Target
// are entered fresh by the Tổ trưởng every day (see aggregation.py's module
// docstring), so these just go in as bootstrap zeros the backend still
// requires on create.
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

export function AddLineForm({
  toTruongs,
  executiveNames,
  onCreated,
}: {
  toTruongs: User[];
  executiveNames: string[];
  onCreated: () => void;
}) {
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
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div>
        <Label>Line</Label>
        <Input required value={form.line_number} onChange={(e) => setForm({ ...form, line_number: e.target.value })} placeholder="VD: 01AB" />
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
        <Input
          required
          list="executive-name-options"
          value={form.executive_name}
          onChange={(e) => setForm({ ...form, executive_name: e.target.value })}
          placeholder="Ms Thảo"
        />
        <datalist id="executive-name-options">
          {executiveNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
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

      <div className="col-span-2 flex items-end gap-2 sm:col-span-4">
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <Button type="submit" disabled={saving} size="sm">
          <Plus size={14} /> {saving ? "Đang thêm..." : "Thêm Line"}
        </Button>
      </div>
    </form>
  );
}
