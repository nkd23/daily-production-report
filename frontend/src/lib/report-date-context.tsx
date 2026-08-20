"use client";

import { createContext, useContext, useEffect, useState } from "react";

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
//
// Each page passes its own preferred default (Dashboard defaults to
// yesterday, the entry pages default to today), which only matters for
// whichever page the user happens to land on first in a session - as soon as
// that default resolves, it's written into the shared context so every other
// page adopts it too, rather than each page silently falling back to its own
// default until the user manually touches a date picker somewhere.
export function useSharedReportDate(defaultDate: string): [string, (date: string) => void] {
  const ctx = useContext(ReportDateContext);
  if (!ctx) throw new Error("useSharedReportDate must be used within ReportDateProvider");
  const { reportDate, setReportDate } = ctx;
  useEffect(() => {
    if (reportDate === null) setReportDate(defaultDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportDate]);
  return [reportDate ?? defaultDate, setReportDate];
}
