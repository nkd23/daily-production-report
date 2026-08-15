"use client";

import { createContext, useContext, useState } from "react";

interface ReportDateContextValue {
  reportDate: string | null;
  setReportDate: (date: string) => void;
}

const ReportDateContext = createContext<ReportDateContextValue | undefined>(undefined);

export function ReportDateProvider({ children }: { children: React.ReactNode }) {
  const [reportDate, setReportDate] = useState<string | null>(null);
  return (
    <ReportDateContext.Provider value={{ reportDate, setReportDate }}>{children}</ReportDateContext.Provider>
  );
}

// Drop-in replacement for `useState(defaultDate)` - behaves like a normal
// per-page date picker until the user explicitly changes it, at which point
// the choice is shared across every page using this hook (Dashboard, Theo
// dõi nộp báo cáo, Dữ liệu sản xuất), so switching tabs keeps the same date
// instead of resetting to each page's own default.
export function useSharedReportDate(defaultDate: string): [string, (date: string) => void] {
  const ctx = useContext(ReportDateContext);
  if (!ctx) throw new Error("useSharedReportDate must be used within ReportDateProvider");
  return [ctx.reportDate ?? defaultDate, ctx.setReportDate];
}
