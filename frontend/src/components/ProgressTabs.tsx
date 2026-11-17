"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// "Tiến độ" holds two views under one menu item (the top menu has no room
// for another entry): running orders and the weekly Close order list.
const TABS = [
  { href: "/tien-do", label: "Đơn đang chạy" },
  { href: "/tien-do/close-order", label: "Close order" },
];

export function ProgressTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-5 flex gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              active ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
