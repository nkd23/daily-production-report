"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Factory, Lock, User as UserIcon } from "lucide-react";
import { useAuth, roleHomePath } from "@/lib/auth-context";
import { Button, Input, Label } from "@/components/ui";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace(roleHomePath[user.role]);
    }
  }, [loading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedInUser = await login(username, password);
      router.replace(roleHomePath[loggedInUser.role]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đăng nhập thất bại, vui lòng thử lại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-[radial-gradient(circle_at_top,_#eef2ff,_#f4f6fb_55%)] px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Factory size={28} />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Báo Cáo Sản Lượng Hàng Ngày</h1>
          <p className="mt-1 text-sm text-muted">Đăng nhập để nhập &amp; theo dõi sản lượng</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-surface p-6 shadow-xl shadow-slate-200/60"
        >
          <div className="mb-4">
            <Label>Tên đăng nhập</Label>
            <div className="relative">
              <UserIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input
                autoFocus
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="vd: totruong1"
                className="pl-9"
              />
            </div>
          </div>

          <div className="mb-5">
            <Label>Mật khẩu</Label>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9"
              />
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
          ) : null}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>
      </div>
    </div>
  );
}
