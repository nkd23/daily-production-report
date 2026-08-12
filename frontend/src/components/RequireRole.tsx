"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, roleHomePath } from "@/lib/auth-context";
import type { UserRole } from "@/lib/types";

export function RequireRole({
  roles,
  children,
}: {
  roles: UserRole[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!roles.includes(user.role)) {
      router.replace(roleHomePath[user.role]);
    }
  }, [loading, user, roles, router]);

  if (loading || !user || !roles.includes(user.role)) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-sm text-muted">
        Đang tải...
      </div>
    );
  }

  return <>{children}</>;
}
