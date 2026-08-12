"use client";

import { useState } from "react";
import { Plus, ShieldCheck, UserX } from "lucide-react";
import { Badge, Button, Card, Input, Label, Select } from "./ui";
import { api, ApiError } from "@/lib/api";
import { roleLabel } from "@/lib/auth-context";
import type { User, UserRole } from "@/lib/types";

export function UserManagement({ users, onChanged }: { users: User[]; onChanged: () => void }) {
  const [form, setForm] = useState({ username: "", password: "", full_name: "", role: "to_truong" as UserRole });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createUser(form);
      setForm({ username: "", password: "", full_name: "", role: "to_truong" });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể tạo tài khoản");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: User) {
    await api.updateUser(user.id, { is_active: !user.is_active });
    onChanged();
  }

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Quản lý tài khoản</h2>

      <form onSubmit={handleSubmit} className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label>Tên đăng nhập</Label>
          <Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div>
          <Label>Mật khẩu</Label>
          <Input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div>
          <Label>Họ tên</Label>
          <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div>
          <Label>Vai trò</Label>
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
            <option value="to_truong">Tổ trưởng</option>
            <option value="thu_ky">Thư ký</option>
            <option value="sep">Sếp</option>
          </Select>
        </div>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-4">
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <Button type="submit" size="sm" disabled={saving}>
            <Plus size={14} /> {saving ? "Đang tạo..." : "Tạo tài khoản"}
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3 font-medium">Tên đăng nhập</th>
              <th className="py-2 pr-3 font-medium">Họ tên</th>
              <th className="py-2 pr-3 font-medium">Vai trò</th>
              <th className="py-2 pr-3 font-medium">Trạng thái</th>
              <th className="py-2 pr-3 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="py-2 pr-3">{u.username}</td>
                <td className="py-2 pr-3">{u.full_name}</td>
                <td className="py-2 pr-3">
                  <Badge tone="primary">{roleLabel[u.role]}</Badge>
                </td>
                <td className="py-2 pr-3">
                  {u.is_active ? <Badge tone="success">Hoạt động</Badge> : <Badge tone="default">Đã khoá</Badge>}
                </td>
                <td className="py-2 pr-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(u)}>
                    {u.is_active ? <UserX size={14} className="text-danger" /> : <ShieldCheck size={14} className="text-success" />}
                    {u.is_active ? "Khoá" : "Kích hoạt"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
