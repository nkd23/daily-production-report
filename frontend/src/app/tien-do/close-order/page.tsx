"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  CalendarOff,
  CheckCircle2,
  Boxes,
  ClipboardCheck,
  Download,
  FileClock,
  Timer,
  RotateCcw,
  Info,
  Percent,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { RequireRole } from "@/components/RequireRole";
import { PageShell } from "@/components/PageShell";
import { ProgressTabs } from "@/components/ProgressTabs";
import { Badge, Button, Card, Input, Select, StatCard } from "@/components/ui";
import { api, ApiError, type CloseOrderPatch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { execColor } from "@/lib/exec-colors";
import type { CloseOrderItem, CloseOrderWeek, CloseOrderWeekView, Holiday } from "@/lib/types";

const UNASSIGNED = "Chưa phân Executive";
const NO_DEPT = "Chưa ghi bộ phận";
// Status colours: on time = good, late = critical. Always with a legend and
// the counts in text, never colour alone.
// From the factory's own Close Order dashboard palette (validated for
// colour-blind separation): teal = on time, coral = late.
const COLOR_ONTIME = "#249D8F";
const COLOR_LATE = "#E76F51";
// Departments blamed for late orders; "not recorded yet" stays neutral grey.
const DEPT_COLORS: Record<string, string> = {
  Sewing: "#C8961C",
  Washing: "#2F80B5",
  Cutting: "#D1495B",
  Finishing: "#9B5DE5",
  Khác: "#6B8F23",
};
const NO_DEPT_COLOR = "#94A3B8";
const deptColor = (d: string) => DEPT_COLORS[d] ?? NO_DEPT_COLOR;
const COLOR_SEW = "#C8961C";
const COLOR_PACK = "#2F80B5";
const TICK = { fontSize: 12, fill: "var(--muted)" };

function ddmm(iso: string | null, withYear = false) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return withYear ? `${m[3]}/${m[2]}/${m[1]}` : `${m[3]}/${m[2]}`;
}

function dateTime(value: string) {
  const d = new Date(value);
  return `${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} ${d.toLocaleDateString("vi-VN")}`;
}

function num(v: number | null) {
  return v == null ? "" : v.toLocaleString("vi-VN");
}

function pct(part: number, total: number) {
  return total ? `${Math.round((part / total) * 1000) / 10}%` : "-";
}

const execOf = (i: CloseOrderItem) => i.executive_name ?? UNASSIGNED;

type Filters = { executive: string; line: string; dept: string; buyer: string };
const NO_FILTERS: Filters = { executive: "", line: "", dept: "", buyer: "" };

// ---------- small building blocks ----------

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="mb-3 mt-8">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ChartCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {note ? <p className="mb-2 mt-0.5 text-xs text-muted">{note}</p> : <div className="mb-2" />}
      {children}
    </Card>
  );
}

/** Horizontal stacked on time / late bars, one row per category. */
function OntimeLateBars({
  data,
  onPick,
  width = 120,
}: {
  data: { name: string; ontime: number; late: number }[];
  onPick?: (name: string) => void;
  width?: number;
}) {
  if (!data.length) return <p className="py-6 text-center text-sm text-muted">Không có dữ liệu</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 34 + 56)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" allowDecimals={false} tick={TICK} />
        <YAxis type="category" dataKey="name" width={width} tick={{ fontSize: 12, fill: "var(--foreground)" }} />
        <Tooltip cursor={{ fill: "var(--surface-muted)" }} formatter={(v, n) => [`${v} đơn`, n]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="ontime"
          name="Ontime"
          stackId="s"
          fill={COLOR_ONTIME}
          stroke="var(--surface)"
          strokeWidth={2}
          maxBarSize={22}
          isAnimationActive={false}
          cursor={onPick ? "pointer" : undefined}
          onClick={onPick ? (d) => onPick((d as unknown as { name: string }).name) : undefined}
        />
        <Bar
          dataKey="late"
          name="Late"
          stackId="s"
          fill={COLOR_LATE}
          stroke="var(--surface)"
          strokeWidth={2}
          radius={[0, 4, 4, 0]}
          maxBarSize={22}
          isAnimationActive={false}
          cursor={onPick ? "pointer" : undefined}
          onClick={onPick ? (d) => onPick((d as unknown as { name: string }).name) : undefined}
        >
          <LabelList dataKey="late" position="right" fontSize={11} fill="var(--muted)" formatter={(v) => (v ? `${v} late` : "")} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Single-series count bars (one colour; the title names the series). */
function CountBars({
  data,
  color = COLOR_LATE,
  onPick,
  width = 110,
}: {
  data: { name: string; value: number }[];
  color?: string;
  onPick?: (name: string) => void;
  width?: number;
}) {
  if (!data.length) return <p className="py-6 text-center text-sm text-muted">Không có đơn late</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 30 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" allowDecimals={false} tick={TICK} />
        <YAxis type="category" dataKey="name" width={width} tick={{ fontSize: 12, fill: "var(--foreground)" }} />
        <Tooltip cursor={{ fill: "var(--surface-muted)" }} formatter={(v) => [`${v} đơn`, "Late"]} />
        <Bar
          dataKey="value"
          fill={color}
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
          isAnimationActive={false}
          cursor={onPick ? "pointer" : undefined}
          onClick={onPick ? (d) => onPick((d as unknown as { name: string }).name) : undefined}
        >
          <LabelList dataKey="value" position="right" fontSize={11} fill="var(--muted)" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Part-of-whole donut with the share of each slice listed beside it. */
function Donut({
  data,
  center,
  centerSub,
  onPick,
}: {
  data: { name: string; value: number; color: string }[];
  center: string;
  centerSub: string;
  onPick?: (name: string) => void;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <p className="py-6 text-center text-sm text-muted">Không có dữ liệu</p>;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="100%"
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
              onClick={onPick ? (d) => onPick((d as unknown as { name: string }).name) : undefined}
              cursor={onPick ? "pointer" : undefined}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v, n) => [`${v} đơn (${pct(Number(v), total)})`, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold">{center}</span>
          <span className="text-[11px] text-muted">{centerSub}</span>
        </div>
      </div>
      <ul className="min-w-[9rem] flex-1 space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.name}>
            <button
              type="button"
              disabled={!onPick}
              onClick={() => onPick?.(d.name)}
              className="flex w-full items-center gap-2 rounded px-1 text-left enabled:hover:bg-primary-soft/50"
            >
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
              <span className="flex-1 truncate">{d.name}</span>
              <span className="tabular-nums text-muted">{d.value}</span>
              <span className="w-12 text-right font-medium tabular-nums">{pct(d.value, total)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Executive x line grid of late counts: darker = more late orders. */
function LateHeatmap({
  rows,
  cols,
  value,
  onPick,
}: {
  rows: string[];
  cols: string[];
  value: (row: string, col: string) => number;
  onPick: (row: string, col: string) => void;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => cols.map((c) => value(r, c))));
  if (!cols.length) return <p className="py-6 text-center text-sm text-muted">Không có đơn late</p>;
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c} className="px-1 font-medium text-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th className="whitespace-nowrap pr-2 text-left font-medium">{r}</th>
              {cols.map((c) => {
                const v = value(r, c);
                const a = v ? 0.18 + 0.82 * (v / max) : 0;
                return (
                  <td key={c}>
                    <button
                      type="button"
                      disabled={!v}
                      onClick={() => onPick(r, c)}
                      title={v ? `${r} · ${c}: ${v} đơn late` : undefined}
                      className="h-8 w-10 rounded text-center tabular-nums"
                      style={{
                        backgroundColor: v ? `rgba(231, 111, 81, ${a})` : "var(--surface-muted)",
                        color: a > 0.6 ? "#fff" : "var(--foreground)",
                      }}
                    >
                      {v || ""}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RemarkInput({ value, onSave }: { value: string | null; onSave: (text: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const cancelled = useRef(false);

  async function commit() {
    if (cancelled.current) {
      cancelled.current = false;
      setEditing(false);
      return;
    }
    if (draft.trim() !== (value ?? "")) {
      try {
        await onSave(draft.trim());
      } catch (err) {
        alert(err instanceof ApiError ? err.message : "Không lưu được ghi chú");
        return;
      }
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={1000}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
        className="w-52 rounded border border-primary bg-surface px-1.5 py-0.5 text-xs outline-none ring-2 ring-primary/20"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
      title={value ?? "Bấm để ghi lý do"}
      className={`block max-w-[14rem] truncate rounded px-1.5 py-0.5 text-left text-xs hover:bg-primary-soft/60 ${
        value ? "text-foreground" : "text-muted/60"
      }`}
    >
      {value || "+ lý do"}
    </button>
  );
}

/** End Sew / End Pack cell for Finishing: pick a date to correct it, clear
 * it to go back to the trackers' date. */
function DateInput({
  value,
  manual,
  trackerValue,
  emptyLabel,
  onSave,
}: {
  value: string | null;
  manual: boolean;
  trackerValue: string | null;
  emptyLabel?: React.ReactNode;
  onSave: (v: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const iso = value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";

  async function save(next: string | null) {
    try {
      await onSave(next);
      setEditing(false);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Không lưu được ngày");
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="date"
          autoFocus
          defaultValue={iso}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter") {
              const v = e.currentTarget.value;
              if (v && v !== iso) void save(v);
              else setEditing(false);
            }
          }}
          onBlur={(e) => {
            const v = e.currentTarget.value;
            if (v && v !== iso) void save(v);
            else setEditing(false);
          }}
          className="rounded border border-primary bg-surface px-1 py-0.5 text-xs outline-none ring-2 ring-primary/20"
        />
        {manual ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void save(null)}
            title="Trả về ngày của bảng tiến độ"
            className="rounded px-1 text-muted hover:bg-primary-soft hover:text-primary"
          >
            <RotateCcw size={12} />
          </button>
        ) : null}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={
        manual
          ? `Sửa tay. Bảng tiến độ ghi: ${trackerValue ? ddmm(trackerValue, true) : "(trống)"}. Bấm để sửa hoặc trả về.`
          : "Bấm để sửa ngày"
      }
      className="rounded px-1 hover:bg-primary-soft/60"
    >
      {value ? ddmm(value, true) : (emptyLabel ?? "-")}
    </button>
  );
}

/** Late duration cell: blank = back to the formula. */
function DurationInput({ item, onSave }: { item: CloseOrderItem; onSave: (v: number | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const cancelled = useRef(false);

  async function commit() {
    if (cancelled.current) {
      cancelled.current = false;
      setEditing(false);
      return;
    }
    const text = draft.trim();
    if (text !== "" && !/^\d{1,3}$/.test(text)) {
      alert("Nhập số ngày (số nguyên từ 0), hoặc để trống để tính theo công thức.");
      return;
    }
    const next = text === "" ? null : Number(text);
    const current = item.duration_manual ? item.late_duration : null;
    if (next !== current) {
      try {
        await onSave(next);
      } catch (err) {
        alert(err instanceof ApiError ? err.message : "Không lưu được");
        return;
      }
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
        className="w-14 rounded border border-primary bg-surface px-1 py-0.5 text-right text-xs outline-none ring-2 ring-primary/20"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(item.duration_manual && item.late_duration != null ? String(item.late_duration) : "");
        setEditing(true);
      }}
      title={
        item.duration_manual
          ? `Sửa tay. Công thức tính: ${item.auto_late_duration ?? "-"} ngày. Bấm, xoá trống để trả về công thức.`
          : "Bấm để sửa số ngày"
      }
      className="min-w-[2rem] rounded px-1 text-right tabular-nums hover:bg-primary-soft/60"
    >
      {item.late_duration ?? "-"}
    </button>
  );
}

function HolidayPanel({ canEdit, onClose, onChanged }: { canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const [list, setList] = useState<Holiday[] | null>(null);
  const [day, setDay] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listHolidays().then(setList).catch(() => setError("Không tải được danh sách ngày lễ"));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!day) return;
    setError(null);
    try {
      await api.addHoliday(day, name);
      setDay("");
      setName("");
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thêm được ngày lễ");
    }
  }

  async function remove(h: Holiday) {
    if (!confirm(`Xóa ngày lễ ${ddmm(h.day, true)}?`)) return;
    await api.deleteHoliday(h.id);
    load();
    onChanged();
  }

  return (
    <Card className="mb-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Ngày lễ (không tính vào Late duration)</h2>
        <button type="button" onClick={onClose} className="text-muted hover:text-foreground" title="Đóng">
          <X size={16} />
        </button>
      </div>
      {canEdit ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="!w-auto" />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên (vd. Tết)" className="!w-48" />
          <Button size="sm" onClick={add} disabled={!day}>
            Thêm ngày lễ
          </Button>
          {error ? <span className="text-xs text-danger">{error}</span> : null}
        </div>
      ) : (
        <p className="mb-2 text-xs text-muted">Chỉ tài khoản Manager thêm/xóa được ngày lễ.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {list?.map((h) => (
          <span key={h.id} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs">
            {ddmm(h.day, true)}
            {h.name ? <span className="text-muted">· {h.name}</span> : null}
            {canEdit ? (
              <button type="button" onClick={() => remove(h)} className="text-muted hover:text-danger" title="Xóa">
                <Trash2 size={12} />
              </button>
            ) : null}
          </span>
        ))}
      </div>
    </Card>
  );
}

// ---------- page ----------

const SECTIONS = [
  ["tong-quan", "Tổng quan"],
  ["executive", "Executive"],
  ["nguyen-nhan", "Nguyên nhân"],
  ["line-buyer", "Line & Buyer"],
  ["can-xu-ly", "Cần xử lý"],
  ["chi-tiet", "Chi tiết đơn"],
] as const;

const TH = "whitespace-nowrap border-b border-border bg-surface-muted px-2 py-2 font-medium";
const TD = "whitespace-nowrap border-b border-border px-2 py-1.5";

function CloseOrderContent() {
  const { user } = useAuth();
  const isExecutive = user?.role === "executive";
  const [weeks, setWeeks] = useState<CloseOrderWeek[] | null>(null);
  const [weekStart, setWeekStart] = useState("");
  const [view, setView] = useState<CloseOrderWeekView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [status, setStatus] = useState<"" | "late" | "ontime">("");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [showHolidays, setShowHolidays] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);

  const loadWeeks = useCallback(() => {
    api
      .listCloseOrderWeeks()
      .then((w) => {
        setWeeks(w);
        if (w.length) setWeekStart((cur) => cur || w[0].week_start);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Không tải được danh sách tuần"));
  }, []);

  const loadWeek = useCallback((ws: string) => {
    api
      .getCloseOrderWeek(ws)
      .then((v) => {
        setView(v);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Không tải được Close order"));
  }, []);

  useEffect(() => {
    loadWeeks();
  }, [loadWeeks]);
  useEffect(() => {
    if (weekStart) loadWeek(weekStart);
  }, [weekStart, loadWeek]);

  // Orders Finishing removed stay out of every count, chart and export.
  const items = useMemo(() => (view?.items ?? []).filter((i) => !i.is_removed), [view]);
  const removedItems = useMemo(() => (view?.items ?? []).filter((i) => i.is_removed), [view]);
  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (!filters.executive || execOf(i) === filters.executive) &&
          (!filters.line || i.line_number === filters.line) &&
          (!filters.buyer || i.buyer === filters.buyer) &&
          (!filters.dept || (i.is_late && (i.department ?? NO_DEPT) === filters.dept))
      ),
    [items, filters]
  );
  const late = useMemo(() => filtered.filter((i) => i.is_late), [filtered]);
  const anyFilter = Object.values(filters).some(Boolean);
  const pick = (key: keyof Filters) => (value: string) =>
    setFilters((f) => ({ ...f, [key]: f[key] === value ? "" : value }));

  const prevWeek = useMemo(() => {
    if (!weeks || !weekStart) return null;
    const idx = weeks.findIndex((w) => w.week_start === weekStart);
    return idx >= 0 ? weeks[idx + 1] ?? null : null;
  }, [weeks, weekStart]);

  const trend = useMemo(
    () =>
      [...(weeks ?? [])]
        .reverse()
        .map((w) => ({
          name: ddmm(w.week_start),
          ontime: w.total - w.late,
          late: w.late,
          pctLate: w.total ? `${Math.round((w.late / w.total) * 100)}%` : "",
        })),
    [weeks]
  );

  const byExec = useMemo(() => {
    const map = new Map<string, CloseOrderItem[]>();
    for (const i of filtered) map.set(execOf(i), [...(map.get(execOf(i)) ?? []), i]);
    return [...map.entries()]
      .map(([name, rows]) => {
        const lateRows = rows.filter((r) => r.is_late);
        const deptCounts: Record<string, number> = {};
        for (const r of lateRows) deptCounts[r.department ?? NO_DEPT] = (deptCounts[r.department ?? NO_DEPT] ?? 0) + 1;
        const shortPack = rows.reduce((s, r) => s + (r.pack_cut != null && r.pack_cut < 0 ? -r.pack_cut : 0), 0);
        const sew = rows.reduce((s, r) => s + (r.sew_qty ?? 0), 0);
        const pack = rows.reduce((s, r) => s + (r.pack_qty ?? 0), 0);
        return { name, total: rows.length, late: lateRows.length, ontime: rows.length - lateRows.length, deptCounts, shortPack, sew, pack };
      })
      .sort((a, b) => b.late - a.late || b.total - a.total);
  }, [filtered]);

  const deptNames = useMemo(() => [...(view?.departments ?? []), NO_DEPT], [view]);
  const lateByDept = deptNames
    .map((d) => ({ name: d, value: late.filter((i) => (i.department ?? NO_DEPT) === d).length }))
    .filter((d) => d.value);
  const deptDonut = lateByDept.map((d) => ({ ...d, color: deptColor(d.name) }));
  const deptByExec = byExec
    .filter((e) => e.late)
    .map((e) => ({ name: e.name, ...Object.fromEntries(deptNames.map((d) => [d, e.deptCounts[d] ?? 0])) }));
  const heatLines = [...new Set(late.map((i) => i.line_number))].sort();
  const heatExecs = byExec.filter((e) => e.late).map((e) => e.name);
  const avgLateDuration = (() => {
    const d = late.map((i) => i.late_duration).filter((v): v is number => v != null);
    return d.length ? Math.round((d.reduce((a, b) => a + b, 0) / d.length) * 10) / 10 : null;
  })();
  const orderQty = filtered.reduce((s, i) => s + (i.order_qty ?? 0), 0);

  const reasons = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of late) {
      for (const part of (i.remark ?? "").split(/[,;/+]/)) {
        const key = part.trim().toLowerCase();
        if (key) map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [late]);
  const severity = [
    { name: "3 ngày", test: (d: number) => d === 3 },
    { name: "4 ngày", test: (d: number) => d === 4 },
    { name: "5 ngày", test: (d: number) => d === 5 },
    { name: "6–7 ngày", test: (d: number) => d >= 6 && d <= 7 },
    { name: "8+ ngày", test: (d: number) => d >= 8 },
  ].map((b) => ({ name: b.name, value: late.filter((i) => i.late_duration != null && b.test(i.late_duration)).length }));
  const wfSplit = [true, false].map((wf) => {
    const rows = filtered.filter((i) => i.wf === wf);
    const l = rows.filter((r) => r.is_late).length;
    return { name: wf ? "WF & TAP" : "Đơn thường", ontime: rows.length - l, late: l };
  });
  const lateByLine = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of late) map.set(i.line_number, (map.get(i.line_number) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, value]) => ({ name, value }));
  }, [late]);
  const byBuyer = useMemo(() => {
    const map = new Map<string, { name: string; ontime: number; late: number }>();
    for (const i of filtered) {
      const name = i.buyer ?? "(trống)";
      const row = map.get(name) ?? { name, ontime: 0, late: 0 };
      if (i.is_late) row.late++;
      else row.ontime++;
      map.set(name, row);
    }
    return [...map.values()].sort((a, b) => b.late - a.late || b.ontime + b.late - (a.ontime + a.late)).slice(0, 12);
  }, [filtered]);
  const openLate = late.filter((i) => !i.end_pack).sort((a, b) => (b.late_duration ?? 0) - (a.late_duration ?? 0));

  const detail = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...filtered, ...(showRemoved ? removedItems : [])].filter(
      (i) =>
        (!status || (status === "late") === i.is_late) &&
        (!q || [i.jo, i.buyer, i.line_number, i.remark].some((v) => v?.toLowerCase().includes(q)))
    );
  }, [filtered, removedItems, showRemoved, status, search]);

  const lines = useMemo(() => [...new Set(items.map((i) => i.line_number))].sort(), [items]);
  const buyers = useMemo(() => [...new Set(items.map((i) => i.buyer).filter(Boolean) as string[])].sort(), [items]);
  const execNames = useMemo(() => [...new Set(items.map(execOf))], [items]);

  async function update(item: CloseOrderItem, patch: CloseOrderPatch) {
    const updated = await api.updateCloseOrderItem(item.id, patch);
    setView((v) => (v ? { ...v, items: v.items.map((i) => (i.id === updated.id ? updated : i)) } : v));
    // The weekly late counts (trend chart, week list) may have changed.
    if (["wf", "late_duration", "is_late", "removed", "end_sew", "end_pack"].some((k) => k in patch)) loadWeeks();
  }

  function removeItem(i: CloseOrderItem) {
    if (
      !confirm(
        `Xóa đơn ${i.jo} (line ${i.line_number}) khỏi báo cáo Close order tuần này? Đơn sẽ không còn được tính vào số liệu; xem lại và khôi phục được ở "Hiện đơn đã xóa".`
      )
    )
      return;
    update(i, { removed: true }).catch((err) => alert(err instanceof ApiError ? err.message : "Không xóa được"));
  }

  async function handleExport() {
    if (!weekStart) return;
    setExporting(true);
    try {
      await api.downloadCloseOrderExcel(weekStart);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Không xuất được file Excel");
    } finally {
      setExporting(false);
    }
  }

  const total = filtered.length;
  const ontime = total - late.length;
  const prevPct = prevWeek && prevWeek.total ? (prevWeek.total - prevWeek.late) / prevWeek.total : null;
  const curPct = total ? ontime / total : null;
  const canEdit = view?.can_edit ?? false;
  const canOverride = view?.can_override ?? false;

  return (
    <PageShell
      title="Close order"
      description={
        isExecutive
          ? `Kết quả close order các line của ${user?.executive_name ?? "bạn"} theo tuần End Sew`
          : "Kết quả close order theo tuần End Sew (thứ 2 – thứ 7), chốt lúc 15:00 thứ 5 hằng tuần"
      }
      actions={
        <>
          <Select value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="!w-auto" disabled={!weeks?.length}>
            {weeks?.map((w) => (
              <option key={w.week_start} value={w.week_start}>
                Tuần {ddmm(w.week_start)} – {ddmm(w.week_end, true)} ({w.total} đơn){w.is_published ? "" : " · NHÁP"}
              </option>
            ))}
          </Select>
          <Button variant="secondary" size="sm" onClick={() => setShowHolidays((v) => !v)}>
            <CalendarOff size={14} /> Ngày lễ
          </Button>
          <Button size="sm" onClick={handleExport} disabled={exporting || !view}>
            <Download size={14} /> {exporting ? "Đang xuất..." : "Tải Excel"}
          </Button>
        </>
      }
    >
      <ProgressTabs />
      {showHolidays ? (
        <HolidayPanel
          canEdit={view?.can_edit_holidays ?? false}
          onClose={() => setShowHolidays(false)}
          onChanged={() => {
            loadWeeks();
            if (weekStart) loadWeek(weekStart);
          }}
        />
      ) : null}
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      {weeks && weeks.length === 0 ? (
        <Card className="p-6 text-sm text-muted">
          Chưa có tuần nào. Máy văn phòng gửi số lúc 15:00 thứ 5 và web chốt danh sách tuần trước.
        </Card>
      ) : null}
      {!weeks && !error ? <p className="text-sm text-muted">Đang tải...</p> : null}

      {view ? (
        <>
          <div
            className={`mb-3 flex flex-wrap items-start gap-x-4 gap-y-1 rounded-xl border px-4 py-3 text-xs text-muted ${
              view.source_errors.length ? "border-warning/40 bg-warning-soft/40" : "border-primary/20 bg-primary-soft/40"
            }`}
          >
            <span className="flex items-start gap-1.5">
              {view.source_errors.length ? (
                <TriangleAlert size={15} className="mt-px shrink-0 text-warning" />
              ) : (
                <Info size={15} className="mt-px shrink-0 text-primary" />
              )}
              <span>
                End Sew {ddmm(view.week_start, true)} – {ddmm(view.week_end, true)}
                {view.imported ? " (lấy từ file Close Order Report cũ)" : `, chốt lúc ${dateTime(view.published_at)}`}.{" "}
                <b className="font-medium text-foreground">Late duration</b> = số ngày làm việc từ End Sew đến End Pack (chưa
                pack thì đến hôm nay), không tính Chủ nhật và ngày lễ, trừ 1. Hơn 3 ngày là late; đúng 3 ngày chỉ ontime với đơn
                WF &amp; TAP (Product Category WWF_T).
              </span>
            </span>
            {view.source_errors.length ? (
              <span className="font-medium text-warning">
                Không đọc được: {view.source_errors.map((e) => e.split(":")[0]).join(", ")} (dùng số lần đọc trước)
              </span>
            ) : null}
          </div>

          {!view.is_published ? (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-warning/50 bg-warning-soft px-4 py-3 text-sm">
              <FileClock size={18} className="mt-0.5 shrink-0 text-warning" />
              <p>
                <b>Bản nháp - chỉ Finishing thấy.</b> Manager, Executive và Thư ký chưa thấy tuần này. Hãy hỏi lý do và điền{" "}
                <b>Remark / Department</b> cho các đơn late (xem phần <a href="#can-xu-ly" className="text-primary underline">Cần xử lý</a> và{" "}
                <a href="#chi-tiet" className="text-primary underline">Chi tiết đơn</a>). <b>15:00 thứ 5</b> web lấy lại số mới nhất từ bảng
                tiến độ, giữ nguyên phần đã điền, rồi công bố cho mọi người.
              </p>
            </div>
          ) : null}

          {/* Section links + page-wide filters */}
          <div className="sticky top-[57px] z-10 -mx-4 mb-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
            <nav className="mb-2 flex gap-1 overflow-x-auto text-sm">
              {SECTIONS.map(([id, label]) => (
                <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-lg px-3 py-1 text-muted hover:bg-primary-soft hover:text-primary">
                  {label}
                </a>
              ))}
            </nav>
            <div className="flex flex-wrap items-center gap-2">
              {!isExecutive ? (
                <Select value={filters.executive} onChange={(e) => setFilters({ ...filters, executive: e.target.value })} className="!w-auto">
                  <option value="">Tất cả Executive</option>
                  {execNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              ) : null}
              <Select value={filters.line} onChange={(e) => setFilters({ ...filters, line: e.target.value })} className="!w-auto">
                <option value="">Tất cả line</option>
                {lines.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
              <Select value={filters.dept} onChange={(e) => setFilters({ ...filters, dept: e.target.value })} className="!w-auto">
                <option value="">Bộ phận gây late</option>
                {deptNames.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
              <Select value={filters.buyer} onChange={(e) => setFilters({ ...filters, buyer: e.target.value })} className="!w-auto max-w-[12rem]">
                <option value="">Tất cả buyer</option>
                {buyers.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
              {anyFilter ? (
                <Button variant="ghost" size="sm" onClick={() => setFilters(NO_FILTERS)}>
                  <X size={14} /> Xóa lọc
                </Button>
              ) : (
                <span className="text-xs text-muted">Bấm vào thanh biểu đồ hoặc dòng bảng để lọc cả trang.</span>
              )}
            </div>
          </div>

          <Section id="tong-quan" title="Tổng quan">
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatCard label="Tổng đơn close" value={String(total)} icon={ClipboardCheck} tone="primary" />
              <StatCard label="Ontime" value={String(ontime)} sub={pct(ontime, total)} icon={CheckCircle2} tone="success" />
              <StatCard label="Late" value={String(late.length)} sub={pct(late.length, total)} icon={TriangleAlert} tone="danger" />
              <StatCard
                label="% Ontime"
                value={curPct == null ? "-" : `${Math.round(curPct * 1000) / 10}%`}
                sub={
                  prevPct == null || curPct == null || anyFilter
                    ? undefined
                    : `Tuần trước ${Math.round(prevPct * 1000) / 10}% (${curPct >= prevPct ? "+" : ""}${
                        Math.round((curPct - prevPct) * 1000) / 10
                      } điểm)`
                }
                icon={Percent}
              />
              <StatCard
                label="Late duration TB"
                value={avgLateDuration == null ? "-" : `${avgLateDuration} ngày`}
                sub="trung bình các đơn late"
                icon={Timer}
                tone="warning"
              />
              <StatCard label="Tổng Order Qty" value={num(orderQty) || "0"} sub="pcs các đơn close" icon={Boxes} />
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
            <ChartCard title={`Xu hướng ${trend.length} tuần gần nhất`} note="Số đơn ontime/late mỗi tuần; con số trên cột là % late (càng thấp càng tốt). Toàn bộ các line, không theo bộ lọc. Web giữ 6 tuần gần nhất.">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trend} margin={{ top: 22, right: 8, bottom: 4, left: -8 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis allowDecimals={false} tick={TICK} />
                  <Tooltip cursor={{ fill: "var(--surface-muted)" }} formatter={(v, n) => [`${v} đơn`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ontime" name="Ontime" stackId="t" fill={COLOR_ONTIME} stroke="var(--surface)" strokeWidth={2} maxBarSize={44} isAnimationActive={false} />
                  <Bar dataKey="late" name="Late" stackId="t" fill={COLOR_LATE} stroke="var(--surface)" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                    <LabelList dataKey="pctLate" position="top" fontSize={11} fill="var(--muted)" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            </div>
            <ChartCard title="Tỷ lệ Ontime / Late" note="Tuần đang xem, theo bộ lọc.">
              <Donut
                data={[
                  { name: "Ontime", value: ontime, color: COLOR_ONTIME },
                  { name: "Late", value: late.length, color: COLOR_LATE },
                ]}
                center={pct(ontime, total)}
                centerSub="ontime"
              />
            </ChartCard>
            </div>
          </Section>

          <Section id="executive" title="Executive" description="Kết quả close order và bộ phận gây late của từng Executive. Bấm vào dòng hoặc thanh để lọc.">
            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="overflow-x-auto p-0 lg:col-span-3">
                <table className="w-full border-separate border-spacing-0 text-left text-xs">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-muted">
                      <th className={TH}>Executive</th>
                      <th className={`${TH} text-right`}>Tổng</th>
                      <th className={`${TH} text-right`}>Ontime</th>
                      <th className={`${TH} text-right`}>Late</th>
                      <th className={`${TH} text-right`}>% Ontime</th>
                      {deptNames.map((d) => (
                        <th key={d} className={`${TH} text-right`} title={`Late do ${d}`}>
                          {d === NO_DEPT ? "Chưa ghi" : d}
                        </th>
                      ))}
                      <th className={`${TH} text-right`} title="Tổng pcs pack còn thiếu so với cut ở các đơn Pack-Cut âm">
                        Thiếu pack
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {byExec.map((e) => (
                      <tr
                        key={e.name}
                        onClick={() => pick("executive")(e.name)}
                        className={`cursor-pointer hover:bg-primary-soft/40 ${filters.executive === e.name ? "bg-primary-soft" : ""}`}
                      >
                        <td className={`${TD} font-medium`}>
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: e.name === UNASSIGNED ? "#94a3b8" : execColor(e.name).solid }}
                            />
                            {e.name}
                          </span>
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{e.total}</td>
                        <td className={`${TD} text-right tabular-nums`}>{e.ontime}</td>
                        <td className={`${TD} text-right font-semibold tabular-nums ${e.late ? "text-danger" : ""}`}>{e.late}</td>
                        <td className={`${TD} text-right tabular-nums`}>{pct(e.ontime, e.total)}</td>
                        {deptNames.map((d) => (
                          <td key={d} className={`${TD} text-right tabular-nums text-muted`}>
                            {e.deptCounts[d] || ""}
                          </td>
                        ))}
                        <td className={`${TD} text-right tabular-nums`}>{e.shortPack ? num(e.shortPack) : ""}</td>
                      </tr>
                    ))}
                    {byExec.length > 1 ? (
                      <tr className="font-semibold">
                        <td className={TD}>THV</td>
                        <td className={`${TD} text-right tabular-nums`}>{total}</td>
                        <td className={`${TD} text-right tabular-nums`}>{ontime}</td>
                        <td className={`${TD} text-right tabular-nums text-danger`}>{late.length}</td>
                        <td className={`${TD} text-right tabular-nums`}>{pct(ontime, total)}</td>
                        {deptNames.map((d) => (
                          <td key={d} className={`${TD} text-right tabular-nums`}>
                            {late.filter((i) => (i.department ?? NO_DEPT) === d).length || ""}
                          </td>
                        ))}
                        <td className={`${TD} text-right tabular-nums`}>
                          {num(filtered.reduce((s, r) => s + (r.pack_cut != null && r.pack_cut < 0 ? -r.pack_cut : 0), 0)) || ""}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </Card>
              <div className="lg:col-span-2">
                <ChartCard title="Ontime / Late theo Executive" note="Sắp theo số đơn late nhiều nhất.">
                  <OntimeLateBars data={byExec} onPick={pick("executive")} width={130} />
                </ChartCard>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <ChartCard title="Late theo bộ phận của từng Executive" note="Mỗi thanh là một Executive, chia theo bộ phận chịu trách nhiệm.">
                {deptByExec.length ? (
                  <ResponsiveContainer width="100%" height={Math.max(150, deptByExec.length * 38 + 70)}>
                    <BarChart data={deptByExec} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
                      <CartesianGrid horizontal={false} stroke="var(--border)" />
                      <XAxis type="number" allowDecimals={false} tick={TICK} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: "var(--foreground)" }} />
                      <Tooltip cursor={{ fill: "var(--surface-muted)" }} formatter={(v, n) => [`${v} đơn`, n]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {deptNames
                        .filter((d) => deptByExec.some((r) => (r as Record<string, number | string>)[d]))
                        .map((d) => (
                          <Bar key={d} dataKey={d} name={d} stackId="d" fill={deptColor(d)} stroke="var(--surface)" strokeWidth={2} maxBarSize={22} isAnimationActive={false} />
                        ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-6 text-center text-sm text-muted">Không có đơn late</p>
                )}
              </ChartCard>
              <ChartCard title="SEW Qty và PACK Qty theo Executive" note="Tổng pcs đã may / đã pack của các đơn close (pcs).">
                <ResponsiveContainer width="100%" height={Math.max(150, byExec.length * 46 + 60)}>
                  <BarChart data={byExec} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
                    <CartesianGrid horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" tick={TICK} tickFormatter={(v) => num(Number(v))} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: "var(--foreground)" }} />
                    <Tooltip cursor={{ fill: "var(--surface-muted)" }} formatter={(v, n) => [`${num(Number(v))} pcs`, n]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="sew" name="SEW Qty" fill={COLOR_SEW} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false}>
                      <LabelList dataKey="sew" position="right" fontSize={10} fill="var(--muted)" formatter={(v) => num(Number(v))} />
                    </Bar>
                    <Bar dataKey="pack" name="PACK Qty" fill={COLOR_PACK} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false}>
                      <LabelList dataKey="pack" position="right" fontSize={10} fill="var(--muted)" formatter={(v) => num(Number(v))} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </Section>

          <Section id="nguyen-nhan" title="Nguyên nhân late" description="Late do khâu nào, vì lý do gì, và trễ bao lâu (Remark và Department in charge do Finishing điền).">
            <div className="grid gap-4 md:grid-cols-2">
              <ChartCard title="Tỷ trọng bộ phận gây late" note="% đơn late theo bộ phận chịu trách nhiệm. Bấm để lọc.">
                <Donut data={deptDonut} center={String(late.length)} centerSub="đơn late" onPick={pick("dept")} />
              </ChartCard>
              <ChartCard title="Mức độ trễ của các đơn late" note="Số đơn late theo Late duration (ngày làm việc).">
                <CountBars data={severity.filter((s) => s.value)} width={70} />
              </ChartCard>
              <ChartCard title="Lý do late ghi nhận" note="Đếm theo Remark; một đơn có thể có nhiều lý do (cách nhau dấu phẩy).">
                {reasons.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {reasons.map(([reason, count]) => (
                      <li key={reason} className="flex items-center gap-2">
                        <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-danger">{count}</span>
                        <span className="truncate">{reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-sm text-muted">Chưa có Remark cho các đơn late</p>
                )}
              </ChartCard>
              <ChartCard title="Đơn WF & TAP so với đơn thường" note="Đơn WF & TAP được tính ontime khi trễ đúng 3 ngày.">
                <OntimeLateBars data={wfSplit.filter((w) => w.ontime + w.late)} width={90} />
              </ChartCard>
            </div>
          </Section>

          <Section id="line-buyer" title="Line & Buyer" description="Điểm nóng theo chuyền và theo khách hàng.">
            <div className="mb-4">
              <ChartCard title="Số đơn late: Executive theo Line" note="Ô càng đậm càng nhiều đơn late. Bấm vào một ô để lọc theo cả Executive và line đó.">
                <LateHeatmap
                  rows={heatExecs}
                  cols={heatLines}
                  value={(r, c) => late.filter((i) => execOf(i) === r && i.line_number === c).length}
                  onPick={(r, c) => setFilters((f) => ({ ...f, executive: r, line: c }))}
                />
              </ChartCard>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <ChartCard title="Số đơn late theo line" note="Chỉ hiện các line có đơn late. Bấm để lọc.">
                <CountBars data={lateByLine} onPick={pick("line")} width={50} />
              </ChartCard>
              <ChartCard title="Theo buyer" note="Buyer có nhiều đơn late nhất ở trên cùng (12 buyer đầu). Bấm để lọc.">
                <OntimeLateBars data={byBuyer} onPick={pick("buyer")} width={140} />
              </ChartCard>
            </div>
          </Section>

          <Section id="can-xu-ly" title={`Cần xử lý (${openLate.length})`} description="Đơn late mà chưa End Pack - Late duration vẫn đang tăng mỗi ngày.">
            {openLate.length ? (
              <Card className="overflow-x-auto p-0">
                <table className="w-full border-separate border-spacing-0 text-left text-xs">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-muted">
                      <th className={TH}>Executive</th>
                      <th className={TH}>Line</th>
                      <th className={TH}>Buyer</th>
                      <th className={TH}>JO</th>
                      <th className={TH}>End Sew</th>
                      <th className={`${TH} text-right`}>Late</th>
                      <th className={`${TH} text-right`}>Pack-Cut</th>
                      <th className={TH}>Bộ phận</th>
                      <th className={TH}>Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openLate.map((i) => (
                      <tr key={i.id}>
                        <td className={TD}>{execOf(i)}</td>
                        <td className={`${TD} font-semibold`}>{i.line_number}</td>
                        <td className={TD}>{i.buyer}</td>
                        <td className={`${TD} font-medium`}>{i.jo}</td>
                        <td className={TD}>{ddmm(i.end_sew, true)}</td>
                        <td className={`${TD} text-right font-semibold tabular-nums text-danger`}>{i.late_duration} ngày</td>
                        <td className={`${TD} text-right tabular-nums ${i.pack_cut && i.pack_cut < 0 ? "text-danger" : ""}`}>{num(i.pack_cut)}</td>
                        <td className={TD}>{i.department}</td>
                        <td className={`${TD} max-w-[16rem] truncate`} title={i.remark ?? undefined}>
                          {i.remark}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ) : (
              <Card className="p-6 text-sm text-muted">Không có đơn late nào còn chưa pack.</Card>
            )}
          </Section>

          <Section
            id="chi-tiet"
            title="Chi tiết đơn hàng"
            description={
              canOverride
                ? "Bấm vào ô Remark để ghi lý do; chọn bộ phận, WF & TAP; sửa End Sew, End Pack, Late duration hoặc Late/Ontime ngay trên bảng (Late duration tự tính lại theo ngày mới; rê chuột vào ô đã sửa để xem số gốc của bảng tiến độ). Nút Xóa bỏ đơn khỏi báo cáo, khôi phục được."
                : canEdit
                  ? "Bấm vào ô Remark để ghi lý do; chọn bộ phận và WF & TAP ngay trên bảng."
                  : undefined
            }
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm JO, buyer, line, remark..." className="pl-8" />
              </div>
              <Select value={status} onChange={(e) => setStatus(e.target.value as "" | "late" | "ontime")} className="!w-auto">
                <option value="">Ontime + Late</option>
                <option value="late">Chỉ Late</option>
                <option value="ontime">Chỉ Ontime</option>
              </Select>
              {removedItems.length && canOverride ? (
                <label className="flex items-center gap-1.5 text-sm text-muted">
                  <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
                  Hiện đơn đã xóa ({removedItems.length})
                </label>
              ) : null}
              <span className="ml-auto text-sm text-muted">{detail.length} đơn</span>
            </div>
            <Card className="overflow-hidden p-0">
              <div className="max-h-[calc(100dvh-10rem)] overflow-auto lg:max-h-[calc(100dvh-6rem)]">
                <table className="w-full border-separate border-spacing-0 text-left text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="text-[11px] uppercase tracking-wide text-muted">
                      <th className={TH}>Executive</th>
                      <th className={TH}>Line</th>
                      <th className={TH}>Byr</th>
                      <th className={TH}>JO</th>
                      <th className={`${TH} text-right`}>Order</th>
                      <th className={TH}>BPO</th>
                      <th className={TH}>Exfty</th>
                      <th className={`${TH} text-right`}>Cut</th>
                      <th className={`${TH} text-right`}>Sew</th>
                      <th className={`${TH} text-right`}>Pack</th>
                      <th className={`${TH} text-right`}>Pack-Cut</th>
                      <th className={TH}>End Sew</th>
                      <th className={TH}>End Pack</th>
                      <th className={`${TH} text-right`}>Late duration</th>
                      <th className={TH}>Late</th>
                      <th className={TH}>WF &amp; TAP</th>
                      <th className={TH}>Remark</th>
                      <th className={TH}>Department</th>
                      {canOverride ? <th className={TH} /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.map((i) => (
                      <tr
                        key={i.id}
                        className={i.is_removed ? "text-muted line-through decoration-muted/50" : i.is_late ? "bg-danger-soft/50" : ""}
                      >
                        <td className={TD}>{execOf(i)}</td>
                        <td className={`${TD} font-semibold`}>{i.line_number}</td>
                        <td className={`${TD} max-w-[9rem] truncate`} title={i.buyer ?? undefined}>
                          {i.buyer}
                        </td>
                        <td className={`${TD} font-medium`}>{i.jo}</td>
                        <td className={`${TD} text-right tabular-nums`}>{num(i.order_qty)}</td>
                        <td className={TD}>{ddmm(i.bpo_date)}</td>
                        <td className={TD}>{ddmm(i.exfty_date)}</td>
                        <td className={`${TD} text-right tabular-nums`}>{num(i.cut_qty)}</td>
                        <td className={`${TD} text-right tabular-nums`}>{num(i.sew_qty)}</td>
                        <td className={`${TD} text-right tabular-nums`}>{num(i.pack_qty)}</td>
                        <td className={`${TD} text-right tabular-nums ${i.pack_cut && i.pack_cut < 0 ? "font-semibold text-danger" : ""}`}>
                          {num(i.pack_cut)}
                        </td>
                        <td className={TD}>
                          {canOverride && !i.is_removed ? (
                            <DateInput
                              value={i.end_sew}
                              manual={i.end_sew_manual}
                              trackerValue={i.tracker_end_sew}
                              onSave={(v) => update(i, { end_sew: v })}
                            />
                          ) : (
                            ddmm(i.end_sew, true)
                          )}
                        </td>
                        <td className={TD}>
                          {canOverride && !i.is_removed ? (
                            <DateInput
                              value={i.end_pack}
                              manual={i.end_pack_manual}
                              trackerValue={i.tracker_end_pack}
                              emptyLabel={<Badge tone="warning">Chưa pack</Badge>}
                              onSave={(v) => update(i, { end_pack: v })}
                            />
                          ) : i.end_pack ? (
                            ddmm(i.end_pack, true)
                          ) : (
                            <Badge tone="warning">Chưa pack</Badge>
                          )}
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {canOverride && !i.is_removed ? (
                            <DurationInput item={i} onSave={(v) => update(i, { late_duration: v })} />
                          ) : (
                            i.late_duration ?? ""
                          )}
                        </td>
                        <td className={TD}>
                          {canOverride && !i.is_removed ? (
                            <select
                              value={i.late_manual ? (i.is_late ? "late" : "ontime") : "auto"}
                              onChange={(e) => {
                                const v = e.target.value;
                                update(i, { is_late: v === "auto" ? null : v === "late" }).catch((err) =>
                                  alert(err instanceof ApiError ? err.message : "Không lưu được")
                                );
                              }}
                              title={i.late_manual ? `Sửa tay. Công thức tính: ${i.auto_is_late ? "late" : "ontime"}` : undefined}
                              className={`rounded border px-1 py-0.5 text-xs font-medium ${
                                i.is_late ? "border-danger/40 bg-danger-soft text-danger" : "border-success/40 bg-success-soft text-success"
                              }`}
                            >
                              <option value="auto">Tự động ({i.duration_manual ? (i.is_late ? "late" : "ontime") : i.auto_is_late ? "late" : "ontime"})</option>
                              <option value="late">late</option>
                              <option value="ontime">ontime</option>
                            </select>
                          ) : i.is_late ? (
                            <Badge tone="danger">late</Badge>
                          ) : (
                            <Badge tone="success">ontime</Badge>
                          )}
                        </td>
                        <td className={TD}>
                          {canEdit ? (
                            <select
                              value={i.wf_manual ? (i.wf ? "yes" : "no") : "auto"}
                              onChange={(e) => {
                                const v = e.target.value;
                                update(i, { wf: v === "auto" ? null : v === "yes" }).catch((err) =>
                                  alert(err instanceof ApiError ? err.message : "Không lưu được")
                                );
                              }}
                              className="rounded border border-border bg-surface px-1 py-0.5 text-xs"
                              title={`Product Category: ${i.product_category ?? "không rõ"}`}
                            >
                              <option value="auto">Tự động ({i.product_category === "WWF_T" ? "WF" : "thường"})</option>
                              <option value="yes">WF</option>
                              <option value="no">Không</option>
                            </select>
                          ) : i.wf ? (
                            "WF"
                          ) : (
                            ""
                          )}
                        </td>
                        <td className="border-b border-border px-1 py-1">
                          {canEdit ? (
                            <RemarkInput value={i.remark} onSave={(t) => update(i, { remark: t })} />
                          ) : (
                            <span className="block max-w-[14rem] truncate px-1" title={i.remark ?? undefined}>
                              {i.remark}
                            </span>
                          )}
                        </td>
                        <td className="border-b border-border px-1 py-1">
                          {canEdit ? (
                            <select
                              value={i.department ?? ""}
                              onChange={(e) =>
                                update(i, { department: e.target.value }).catch((err) =>
                                  alert(err instanceof ApiError ? err.message : "Không lưu được")
                                )
                              }
                              className="rounded border border-border bg-surface px-1 py-0.5 text-xs"
                            >
                              <option value="">-</option>
                              {view.departments.map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="px-1">{i.department}</span>
                          )}
                        </td>
                        {canOverride ? (
                          <td className={`${TD} text-right no-underline`}>
                            {i.is_removed ? (
                              <button
                                type="button"
                                onClick={() =>
                                  update(i, { removed: false }).catch((err) =>
                                    alert(err instanceof ApiError ? err.message : "Không khôi phục được")
                                  )
                                }
                                title={`Xóa bởi ${i.removed_by ?? "?"}${i.removed_at ? ` lúc ${dateTime(i.removed_at)}` : ""} - bấm để khôi phục`}
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-primary hover:bg-primary-soft"
                              >
                                <RotateCcw size={13} /> Khôi phục
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => removeItem(i)}
                                title="Xóa đơn khỏi báo cáo (khôi phục được)"
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted hover:bg-danger-soft hover:text-danger"
                              >
                                <Trash2 size={13} /> Xóa
                              </button>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </Section>
        </>
      ) : null}
    </PageShell>
  );
}

export default function CloseOrderPage() {
  return (
    <RequireRole roles={["thu_ky", "sep", "executive", "finishing"]}>
      <CloseOrderContent />
    </RequireRole>
  );
}
