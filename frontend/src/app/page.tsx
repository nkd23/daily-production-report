"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, roleHomePath } from "@/lib/auth-context";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? roleHomePath[user.role] : "/login");
  }, [loading, user, router]);

  return <div className="flex flex-1 items-center justify-center py-24 text-sm text-muted">Đang tải...</div>;
}
