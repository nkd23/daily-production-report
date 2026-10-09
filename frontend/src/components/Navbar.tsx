"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardList, Settings2, LogOut, Factory, KeyRound, Table2, CalendarRange } from "lucide-react";
import { useAuth, roleLabel } from "@/lib/auth-context";
import { ChangePasswordModal } from "./ChangePasswordModal";
import type { UserRole } from "@/lib/types";

const NAV_ITEMS: { href: string; label: string; shortLabel: string; icon: typeof LayoutDashboard; roles: UserRole[] }[] = [
  { href: "/to-truong", label: "Nhập sản lượng", shortLabel: "Nhập", icon: ClipboardList, roles: ["to_truong"] },
  { href: "/thu-ky", label: "Theo dõi nộp báo cáo", shortLabel: "Theo dõi", icon: ClipboardList, roles: ["thu_ky", "sep"] },
  { href: "/dashboard", label: "Dashboard", shortLabel: "Dashboard", icon: LayoutDashboard, roles: ["thu_ky", "sep", "executive"] },
  { href: "/bao-cao-tuan", label: "Báo cáo tuần", shortLabel: "Tuần", icon: CalendarRange, roles: ["thu_ky", "sep", "executive"] },
  { href: "/du-lieu-san-xuat", label: "Dữ liệu sản xuất", shortLabel: "Dữ liệu", icon: Table2, roles: ["thu_ky", "sep", "executive"] },
  { href: "/thu-ky/config", label: "Cấu hình Line", shortLabel: "Cấu hình", icon: Settings2, roles: ["thu_ky", "sep"] },
];

export function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [changingPassword, setChangingPassword] = useState(false);

  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 font-semibold text-primary">
            <Factory size={22} />
            <span>Báo Cáo Sản Lượng</span>
          </div>

          <nav className="hidden flex-1 items-center gap-1 overflow-x-auto lg:flex">
            {items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-primary-soft text-primary" : "text-muted hover:bg-slate-100 hover:text-foreground"
                  }`}
                >
                  <Icon size={16} />
                  {/* Full names don't fit beside the account controls below xl. */}
                  <span className="xl:hidden">{item.shortLabel}</span>
                  <span className="hidden xl:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-none">{user.full_name}</p>
              <p className="mt-1 text-xs text-muted">{roleLabel[user.role]}</p>
            </div>
            <button
              onClick={() => setChangingPassword(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-slate-100 hover:text-foreground"
              title="Đổi mật khẩu"
            >
              <KeyRound size={16} />
              {/* Icon-only once the page menu shares this bar (lg+); the title shows on hover. */}
              <span className="hidden sm:inline lg:hidden">Đổi mật khẩu</span>
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-slate-100 hover:text-danger"
              title="Đăng xuất"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline lg:hidden">Đăng xuất</span>
            </button>
          </div>
        </div>
        {changingPassword ? <ChangePasswordModal onClose={() => setChangingPassword(false)} /> : null}
      </header>

      {/* On phones/tablets the top bar has no room for every page, so the
          pages live in an app-style tab bar pinned to the bottom instead. */}
      {items.length > 1 ? (
        <nav
          className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
          aria-label="Điều hướng"
        >
          <div className="mx-auto flex max-w-xl">
            {items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors ${
                    active ? "text-primary" : "text-muted hover:text-foreground"
                  }`}
                >
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-primary-soft" : ""}`}>
                    <Icon size={18} />
                  </span>
                  <span className="max-w-full truncate">{item.shortLabel}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </>
  );
}
