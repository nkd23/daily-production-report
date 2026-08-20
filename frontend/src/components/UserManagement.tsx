"use client";

import { useState } from "react";
import { Check, KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserX, X } from "lucide-react";
import { Badge, Button, Card, Input, Label, Select } from "./ui";
import { api, ApiError } from "@/lib/api";
import { roleLabel } from "@/lib/auth-context";
import type { User, UserRole } from "@/lib/types";

export function UserManagement({
  users,
  executiveNames,
  onChanged,
}: {
  users: User[];
  executiveNames: string[];
  onChanged: () => void;
}) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    full_name: "",
    role: "to_truong" as UserRole,
    executive_name: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resettingId, setResettingId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ username: "", full_name: "", executive_name: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function startEdit(user: User) {
    setEditingId(user.id);
    setEditForm({ username: user.username, full_name: user.full_name, executive_name: user.executive_name ?? "" });
    setEditError(null);
  }

  async function handleSaveEdit(id: number, isExecutive: boolean) {
    setEditSaving(true);
    setEditError(null);
    try {
      await api.updateUser(id, {
        username: editForm.username,
        full_name: editForm.full_name,
        ...(isExecutive ? { executive_name: editForm.executive_name } : {}),
      });
      setEditingId(null);
      onChanged();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Không lưu được thay đổi");
    } finally {
      setEditSaving(false);
    }
  }

  function startReset(id: number) {
    setResettingId(id);
    setResetPassword("");
    setResetError(null);
  }

  async function handleResetPassword(id: number) {
    if (resetPassword.length < 6) {
      setResetError("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }
    setResetSaving(true);
    setResetError(null);
    try {
      await api.updateUser(id, { password: resetPassword });
      setResettingId(null);
      onChanged();
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : "Không đặt lại được mật khẩu");
    } finally {
      setResetSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createUser({
        ...form,
        executive_name: form.role === "executive" ? form.executive_name : null,
      });
      setForm({ username: "", password: "", full_name: "", role: "to_truong", executive_name: "" });
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

  async function handleDelete(user: User) {
    if (!window.confirm(`Xóa hẳn tài khoản "${user.full_name}" (${user.username})? Hành động này không thể hoàn tác.`)) {
      return;
    }
    try {
      await api.deleteUser(user.id);
      onChanged();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Không xóa được tài khoản");
    }
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
            <option value="sep">Manager</option>
            <option value="executive">Executive</option>
          </Select>
        </div>
        {form.role === "executive" ? (
          <div>
            <Label>Executive</Label>
            <Select required value={form.executive_name} onChange={(e) => setForm({ ...form, executive_name: e.target.value })}>
              <option value="">-- Chọn Executive --</option>
              {executiveNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
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
            {users.map((u) => {
              const isEditing = editingId === u.id;
              return (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">
                    {isEditing ? (
                      <Input
                        value={editForm.username}
                        onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                        className="w-40"
                      />
                    ) : (
                      u.username
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {isEditing ? (
                      <Input
                        value={editForm.full_name}
                        onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                        className="w-40"
                      />
                    ) : (
                      u.full_name
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-1.5">
                      <Badge tone="primary">{roleLabel[u.role]}</Badge>
                      {u.role === "executive" ? (
                        isEditing ? (
                          <Select
                            value={editForm.executive_name}
                            onChange={(e) => setEditForm({ ...editForm, executive_name: e.target.value })}
                            className="w-32"
                          >
                            {executiveNames.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-xs text-muted">{u.executive_name}</span>
                        )
                      ) : null}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    {u.is_active ? <Badge tone="success">Hoạt động</Badge> : <Badge tone="default">Đã khoá</Badge>}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {isEditing ? (
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          <Button size="sm" disabled={editSaving} onClick={() => handleSaveEdit(u.id, u.role === "executive")}>
                            <Check size={14} /> {editSaving ? "Đang lưu..." : "Lưu"}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                            <X size={14} /> Hủy
                          </Button>
                        </div>
                        {editError ? <p className="text-xs text-danger">{editError}</p> : null}
                      </div>
                    ) : resettingId === u.id ? (
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          <Input
                            type="password"
                            placeholder="Mật khẩu mới"
                            className="w-36"
                            value={resetPassword}
                            onChange={(e) => setResetPassword(e.target.value)}
                          />
                          <Button size="sm" disabled={resetSaving} onClick={() => handleResetPassword(u.id)}>
                            {resetSaving ? "Đang lưu..." : "Lưu"}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setResettingId(null)}>
                            Hủy
                          </Button>
                        </div>
                        {resetError ? <p className="text-xs text-danger">{resetError}</p> : null}
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(u)}>
                          <Pencil size={14} /> Sửa
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => startReset(u.id)}>
                          <KeyRound size={14} /> Đặt lại MK
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(u)}>
                          {u.is_active ? <UserX size={14} className="text-danger" /> : <ShieldCheck size={14} className="text-success" />}
                          {u.is_active ? "Khoá" : "Kích hoạt"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(u)}>
                          <Trash2 size={14} className="text-danger" /> Xóa
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
