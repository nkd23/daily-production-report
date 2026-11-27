"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  CircleAlert,
  Clock,
  Download,
  Hourglass,
  Info,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { RequireRole } from "@/components/RequireRole";
import { PageShell } from "@/components/PageShell";
import { ProgressTabs } from "@/components/ProgressTabs";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { execColor } from "@/lib/exec-colors";
import type { BpoLevel, ProgressNoteUpdate, ProgressOrder, ProgressQtyField, ProgressResponse } from "@/lib/types";

const UNASSIGNED = "Chưa phân Executive";

function todayISO() {
  return new Date().toLocaleDateString("sv-SE");
}

/** "2026-11-05" -> "05/11/26"; anything else the tracker had ("Done", "Not yet 4") as-is. */
function shortDate(value: string | null) {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : value;
}

function dateTime(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  return `${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} ${d.toLocaleDateString("vi-VN")}`;
}

/** Plain-language reason for the agent's error text (Python exception names). */
function errorHint(error: string | null) {
  const e = error ?? "";
  if (e.startsWith("PermissionError")) return "file đang bị khóa hoặc OneDrive đang đồng bộ dở";
  if (/BadZipFile|InvalidFileException|zipfile|EOFError/i.test(e)) return "file hỏng hoặc chưa tải xong từ OneDrive";
  if (e.startsWith("FileNotFoundError")) return "file đã bị đổi tên/xóa trong lúc đọc";
  if (e.includes("Không thấy sheet")) return 'không thấy sheet "bảng tiến độ" - có thể đã bị đổi tên';
  if (e.includes("Thiếu cột")) return "dòng tiêu đề bị đổi tên cột Line / JO / Pack - cut";
  return "lỗi khi đọc file";
}

function num(value: number | null) {
  return value == null ? "" : value.toLocaleString("vi-VN");
}

function RemarkCell({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (text: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const cancelled = useRef(false);

  async function commit() {
    if (cancelled.current) {
      cancelled.current = false;
      setEditing(false);
      return;
    }
    if (draft.trim() === (value ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Không lưu được ghi chú");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        disabled={saving}
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
        className="w-48 rounded border border-primary bg-surface px-1.5 py-0.5 text-xs outline-none ring-2 ring-primary/20"
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
      title={value ? `${value}
(bấm để sửa)` : "Bấm để ghi chú"}
      className={`block max-w-[14rem] truncate rounded px-1.5 py-0.5 text-left text-xs hover:bg-primary-soft/60 ${
        value ? "text-foreground" : "text-muted/60"
      }`}
    >
      {value || "+ ghi chú"}
    </button>
  );
}

type NumberSave = (order: ProgressOrder, field: ProgressQtyField, value: number | null) => Promise<void>;

/** A quantity cell. Managers can click to correct it; a corrected number is
 * tinted, with the tracker's own number in the tooltip. */
function NumberCell({
  order,
  field,
  canEdit,
  onSave,
}: {
  order: ProgressOrder;
  field: ProgressQtyField;
  canEdit: boolean;
  onSave: NumberSave;
}) {
  const value = order[field];
  const edit = order.edited?.[field];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const cancelled = useRef(false);

  const tip = edit
    ? `Đã sửa tay bởi ${edit.set_by ?? "?"} lúc ${dateTime(edit.set_at)}. Bảng tiến độ ghi: ${
        edit.original == null ? "(trống)" : num(edit.original)
      }.${canEdit ? " Bấm để sửa; xoá trống để trả về số của bảng tiến độ." : ""}`
    : canEdit
      ? "Bấm để sửa số"
      : undefined;

  async function commit() {
    if (cancelled.current) {
      cancelled.current = false;
      setEditing(false);
      return;
    }
    const text = draft.replace(/[.,\s]/g, "");
    if (text !== "" && !/^\d+$/.test(text)) {
      alert("Chỉ nhập số nguyên không âm.");
      return;
    }
    const next = text === "" ? null : Number(text);
    // Empty on a corrected cell = back to the tracker's number.
    if (next === value && !(next === null && edit)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(order, field, next);
      setEditing(false);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Không lưu được số");
    } finally {
      setSaving(false);
    }
  }

  const tint = edit ? "bg-warning-soft font-semibold text-warning" : "";
  if (editing) {
    return (
      <td className="border-b border-border px-1 py-1 text-right">
        <input
          autoFocus
          inputMode="numeric"
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              cancelled.current = true;
              e.currentTarget.blur();
            }
          }}
          className="w-20 rounded border border-primary bg-surface px-1.5 py-0.5 text-right text-xs tabular-nums outline-none ring-2 ring-primary/20"
        />
      </td>
    );
  }
  return (
    <td className={`${TD} text-right tabular-nums ${tint}`} title={tip}>
      {canEdit ? (
        <button
          type="button"
          onClick={() => {
            setDraft(value == null ? "" : String(value));
            setEditing(true);
          }}
          className="-mx-1 min-w-[2.5rem] rounded px-1 text-right hover:bg-primary-soft/60"
        >
          {value == null ? <span className="text-muted/50">-</span> : num(value)}
        </button>
      ) : (
        num(value)
      )}
    </td>
  );
}

// Late = days since End sew while the order is not packed out. Over 4 days
// is late (red); 3-4 days is at risk of going over (amber + warning).
const LATE_LIMIT = 4;
const LATE_RISK_FROM = 3;

function lateLevel(o: ProgressOrder): "late" | "risk" | null {
  if (o.late == null) return null;
  if (o.late > LATE_LIMIT) return "late";
  if (o.late >= LATE_RISK_FROM) return "risk";
  return null;
}

// Row colour = BPO warning (what Managers watch); the End sew -> End pack
// late only colours its own number in the Late column.
const ROW_BG: Record<BpoLevel, string> = {
  overdue: "bg-danger-soft/30",
  late: "bg-danger-soft/15",
  soon: "bg-warning-soft/25",
};
// A thin bar on the row's first cell says how urgent it is, without
// painting the whole row.
const ROW_ACCENT: Record<BpoLevel, string> = {
  overdue: "shadow-[inset_3px_0_0_#ef4444]",
  late: "shadow-[inset_3px_0_0_#fca5a5]",
  soon: "shadow-[inset_3px_0_0_#fcd34d]",
};
const BPO_ORDER: Record<BpoLevel, number> = { overdue: 0, late: 1, soon: 2 };

const BPO_LABEL: Record<BpoLevel, string> = {
  overdue: "Quá BPO",
  late: "Trễ hạn End sew / End pack",
  soon: "Sắp tới hạn (≤ 3 ngày)",
};

const BPO_RULE =
  "Hạn End sew = BPO − 4 ngày làm việc (WF & TAP − 5). Hạn End pack = BPO − 1 ngày làm việc. Ngày làm việc: thứ 2 – thứ 7, trừ ngày lễ.";

function BpoBadge({ order, wrap = false }: { order: ProgressOrder; wrap?: boolean }) {
  if (!order.bpo_level || !order.bpo_warning) return <span className="text-muted/50">-</span>;
  const tone =
    order.bpo_level === "overdue"
      ? "bg-danger-soft text-red-700"
      : order.bpo_level === "late"
        ? "bg-danger-soft/50 text-red-600"
        : "bg-warning-soft/70 text-amber-700";
  const Icon = order.bpo_level === "overdue" ? CircleAlert : order.bpo_level === "late" ? Clock : Hourglass;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${tone} ${
        wrap ? "whitespace-normal" : ""
      }`}
      title={BPO_RULE}
    >
      <Icon size={11} className="shrink-0" />
      {order.bpo_warning}
    </span>
  );
}

/** Close ("Đóng đơn") / reopen button, shared by both views. */
function CloseToggle({
  order,
  onUpdate,
}: {
  order: ProgressOrder;
  onUpdate: (order: ProgressOrder, patch: Omit<ProgressNoteUpdate, "order_key">) => Promise<void>;
}) {
  return order.is_closed ? (
    <button
      type="button"
      onClick={() => void onUpdate(order, { is_closed: false })}
      title={`Đóng bởi ${order.closed_by ?? "?"} lúc ${dateTime(order.closed_at)} - bấm để hiện lại`}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-primary hover:bg-primary-soft"
    >
      <ArchiveRestore size={13} /> Mở lại
    </button>
  ) : (
    <button
      type="button"
      onClick={() => {
        if (
          confirm(
            `Đóng đơn ${order.jo}${order.color ? ` (${order.color})` : ""} - line ${order.line_number}? Đơn sẽ không hiện nữa, kể cả các ngày sau (mở lại được ở "Hiện đơn đã đóng").`
          )
        ) {
          void onUpdate(order, { is_closed: true });
        }
      }}
      title="Đóng đơn: ẩn đơn rác / đơn đã xong mà bảng tiến độ còn lệch số"
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted hover:bg-danger-soft hover:text-danger"
    >
      <Archive size={13} /> Đóng
    </button>
  );
}

/** Cut/Sew (still sewing) or Sew/Pack (sewn) against the order quantity. */
function StageBars({ order }: { order: ProgressOrder }) {
  const base = order.order_qty || order.allocate_qty || 0;
  if (!base) return <span className="text-muted/50">-</span>;
  const stages: [string, number | null][] = order.end_sew
    ? [
        ["May", order.sew_qty],
        ["Pack", order.pack_qty],
      ]
    : [
        ["Cắt", order.cut_qty],
        ["May", order.sew_qty],
      ];
  return (
    <div className="space-y-1">
      {stages.map(([label, value]) => {
        const pct = value ? Math.round((value / base) * 100) : 0;
        return (
          <div key={label} className="flex items-center gap-2" title={`${label}: ${num(value) || 0} / ${num(base)}`}>
            <span className="w-8 shrink-0 text-muted">{label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-primary/45" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className="w-9 shrink-0 text-right tabular-nums text-muted">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function lateText(o: ProgressOrder) {
  if (o.late == null) return o.late_label ?? "-";
  return `${o.late} ngày${lateLevel(o) === "late" ? " (late)" : lateLevel(o) === "risk" ? " (nguy cơ)" : ""}`;
}

/** Fits the screen: the columns a Manager reads, the rest one click away. */
function CompactTable({
  groups,
  onUpdate,
}: {
  groups: [string, ProgressOrder[]][];
  onUpdate: (order: ProgressOrder, patch: Omit<ProgressNoteUpdate, "order_key">) => Promise<void>;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Phones: Line / Đơn / BPO only; progress and Pack-cut move into the details.
  const phone = useCompact();
  const span = phone ? 4 : 6;
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-left text-xs">
      <colgroup>
        <col className="w-12 sm:w-14" />
        <col className={phone ? "w-[40%]" : "w-[26%]"} />
        <col className={phone ? "" : "w-[27%]"} />
        {phone ? null : <col />}
        {phone ? null : <col className="w-20" />}
        <col className="w-7" />
      </colgroup>
      <thead>
        <tr className="text-[11px] uppercase tracking-wide text-muted">
          <th className={TH_FLOW}>Line</th>
          <th className={TH_FLOW}>Đơn</th>
          <th className={TH_FLOW} title={BPO_RULE}>
            BPO · cảnh báo
          </th>
          {phone ? null : <th className={TH_FLOW}>Tiến độ so với Order</th>}
          {phone ? null : <th className={`${TH_FLOW} text-right`}>Pack-cut</th>}
          <th className={TH_FLOW} />
        </tr>
      </thead>
      <tbody>
        {groups.map(([name, orders]) => {
          const counts = { overdue: 0, late: 0, soon: 0 };
          for (const o of orders) if (o.bpo_level) counts[o.bpo_level]++;
          return (
            <Fragment key={name}>
              <tr>
                <td colSpan={span} className="border-b border-border bg-primary-soft/60 px-3 py-2">
                  <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: name === UNASSIGNED ? "#94a3b8" : execColor(name).solid }}
                      />
                      <span className="text-sm font-semibold">{name}</span>
                    </span>
                    <span className="text-muted">{orders.length} đơn</span>
                    {counts.overdue ? <span className="text-red-700">{counts.overdue} quá BPO</span> : null}
                    {counts.late ? <span className="text-red-600">{counts.late} trễ hạn</span> : null}
                    {counts.soon ? <span className="text-amber-700">{counts.soon} sắp tới hạn</span> : null}
                  </span>
                </td>
              </tr>
              {orders.map((o, i) => {
                const key = `${o.order_key}|${o.source_owner}|${i}`;
                const isOpen = open.has(key);
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => toggle(key)}
                      className={`cursor-pointer align-top hover:bg-slate-50 ${o.bpo_level ? ROW_BG[o.bpo_level] : "bg-surface"} ${
                        o.is_closed ? "text-muted line-through decoration-muted/50" : ""
                      }`}
                    >
                      <td className={`${TD} font-semibold ${o.bpo_level ? ROW_ACCENT[o.bpo_level] : ""}`}>{o.line_number}</td>
                      <td className={`${TD} truncate`}>
                        <div className="truncate font-medium" title={o.jo}>
                          {o.jo}
                        </div>
                        <div className="truncate text-muted" title={[o.buyer, o.color].filter(Boolean).join(" · ")}>
                          {[o.buyer, o.color].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className={`${TD} whitespace-normal`}>
                        <div className="font-medium">{shortDate(o.bpo_date) || "-"}</div>
                        {o.bpo_level ? (
                          <div className="mt-0.5">
                            <BpoBadge order={o} wrap />
                          </div>
                        ) : null}
                      </td>
                      {phone ? null : (
                        <td className={TD}>
                          <StageBars order={o} />
                        </td>
                      )}
                      {phone ? null : (
                        <td
                          className={`${TD} text-right font-medium tabular-nums ${
                            o.pack_cut < 0 ? "text-red-600" : o.pack_cut > 0 ? "text-emerald-600" : "text-muted"
                          }`}
                        >
                          {num(o.pack_cut)}
                        </td>
                      )}
                      <td className={`${TD} text-muted`}>
                        <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr>
                        <td colSpan={span} className="border-b border-border bg-surface-muted/60 px-4 py-3">
                          <div className={phone ? "mb-3 space-y-2" : "hidden"}>
                            <StageBars order={o} />
                            <div>
                              <span className="text-muted">Pack-cut: </span>
                              <span className={`font-medium ${o.pack_cut < 0 ? "text-red-600" : ""}`}>{num(o.pack_cut)}</span>
                            </div>
                          </div>
                          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4 lg:grid-cols-6">
                            {(
                              [
                                ["Buyer", o.buyer],
                                ["Màu", o.color],
                                ["Shipment", shortDate(o.shipment_plan)],
                                ["Carton", shortDate(o.order_carton)],
                                ["Start sew", shortDate(o.start_sew)],
                                ["End sew", shortDate(o.end_sew)],
                                ["Order", num(o.order_qty)],
                                ["Allocate", num(o.allocate_qty)],
                                ["Cut", num(o.cut_qty)],
                                ["Sew", num(o.sew_qty)],
                                ["Pack", num(o.pack_qty)],
                                ["Late pack", lateText(o)],
                                ["WF", o.product_category],
                                ["Cust. Style", o.cust_style_no],
                                ["Nguồn", o.source_owner],
                              ] as [string, string | null][]
                            ).map(([label, value]) => (
                              <div key={label} className="min-w-0">
                                <dt className="text-[11px] text-muted">{label}</dt>
                                <dd className="truncate font-medium" title={value ?? undefined}>
                                  {value || "-"}
                                </dd>
                              </div>
                            ))}
                          </dl>
                          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2" onClick={(e) => e.stopPropagation()}>
                            <span className="flex items-center gap-1">
                              <span className="text-muted">EX remark:</span>
                              <RemarkCell value={o.ex_remark} onSave={(t) => onUpdate(o, { ex_remark: t })} />
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="text-muted">FIN remark:</span>
                              <RemarkCell value={o.fin_remark} onSave={(t) => onUpdate(o, { fin_remark: t })} />
                            </span>
                            <span className="ml-auto">
                              <CloseToggle order={o} onUpdate={onUpdate} />
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// Which view each person last chose (per browser); Finishing starts on the
// full table they edit in, everyone else on the compact one.
type ViewMode = "compact" | "full";
const VIEW_KEY = "duy1_progress_view";
const VIEW_EVENT = "duy1-progress-view";

function readView(): ViewMode | null {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "compact" || v === "full" ? v : null;
  } catch {
    return null;
  }
}

function saveView(v: ViewMode) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    // private window etc. - the choice just isn't remembered
  }
  window.dispatchEvent(new Event(VIEW_EVENT));
}

function useSavedView() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      window.addEventListener(VIEW_EVENT, onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(VIEW_EVENT, onChange);
      };
    },
    readView,
    () => null
  );
}

const QTY_FIELDS: ProgressQtyField[] = ["order_qty", "allocate_qty", "cut_qty", "sew_qty", "pack_qty"];

// Header row and the Line / Byr / JO / Màu columns stay put while the table
// scrolls (like Excel's freeze panes). border-separate (set on the table) so
// the borders of those sticky cells move with them.
const TH = "sticky top-0 z-20 whitespace-nowrap border-b border-border bg-surface-muted px-2 py-2 font-medium";
const TD = "whitespace-nowrap border-b border-border px-2 py-1.5";
const TH_PLAIN = "whitespace-nowrap px-2 py-2 font-medium";
// The compact table scrolls with the page, under the sticky top bar - its
// header doesn't stick (it would slide under the bar).
const TH_FLOW = "whitespace-nowrap border-b border-border bg-surface-muted px-2 py-2 font-medium";
const COLUMN_COUNT = 24;

// Line, Byr, JO, Màu: fixed widths, and which of them stay frozen. A phone
// has no room for four frozen columns, so there only Line and JO stay put
// (Byr and Màu scroll under them).
type FrozenLayout = { widths: number[]; frozen: boolean[] };
const WIDE: FrozenLayout = { widths: [56, 120, 124, 96], frozen: [true, true, true, true] };
const COMPACT: FrozenLayout = { widths: [56, 88, 116, 64], frozen: [true, false, true, false] };

function useCompact() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(max-width: 639px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(max-width: 639px)").matches,
    () => false
  );
}

function frozenProps(layout: FrozenLayout, i: number, header: boolean) {
  const w = layout.widths[i];
  const style: React.CSSProperties = { width: w, minWidth: w, maxWidth: w };
  const lastFrozen = layout.frozen.lastIndexOf(true);
  let className = "truncate";
  if (layout.frozen[i]) {
    style.left = layout.widths.slice(0, i).reduce((sum, width, j) => sum + (layout.frozen[j] ? width : 0), 0);
    className += header ? " z-30" : " sticky z-10 bg-inherit";
    if (i === lastFrozen) className += " border-r border-r-border";
  }
  return { className, style };
}

/** Late cell for Finishing: type the number of days; blank goes back to the
 * computed value. Looks like any other value once changed. */
function LateInput({
  order,
  onSave,
  children,
}: {
  order: ProgressOrder;
  onSave: (v: number | null) => Promise<void>;
  children: React.ReactNode;
}) {
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
      alert("Nhập số ngày (số nguyên từ 0), hoặc để trống để tính tự động.");
      return;
    }
    const next = text === "" ? null : Number(text);
    const current = order.late_manual ? order.late : null;
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
        setDraft(order.late_manual && order.late != null ? String(order.late) : "");
        setEditing(true);
      }}
      title={
        order.late_manual
          ? `Sửa tay. Tính tự động: ${order.auto_late ?? "-"} ngày. Bấm, xoá trống để trả về.`
          : "Bấm để sửa số ngày late"
      }
      className="min-w-[2rem] rounded px-1 text-right hover:bg-primary-soft/60"
    >
      {children}
    </button>
  );
}

function OrdersTable({
  groups,
  onUpdate,
  canEditNumbers,
  canEditLate,
  onNumber,
}: {
  groups: [string, ProgressOrder[]][];
  onUpdate: (order: ProgressOrder, patch: Omit<ProgressNoteUpdate, "order_key">) => Promise<void>;
  canEditNumbers: boolean;
  canEditLate: boolean;
  onNumber: NumberSave;
}) {
  const layout = useCompact() ? COMPACT : WIDE;
  const cell = (i: number, header = false) => {
    const { className, style } = frozenProps(layout, i, header);
    return { className: `${header ? TH : TD} ${className}`, style };
  };
  return (
    <div className="max-h-[calc(100dvh-10rem)] overflow-auto lg:max-h-[calc(100dvh-6rem)]">
      <table className="w-full border-separate border-spacing-0 text-left text-xs">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted">
            {["Line", "Byr", "JO", "Màu"].map((label, i) => (
              <th key={label} {...cell(i, true)}>
                {label}
              </th>
            ))}
            <th className={TH}>BPO</th>
            <th className={TH} title={BPO_RULE}>
              Cảnh báo BPO
            </th>
            <th className={TH}>Shipment</th>
            <th className={TH}>Carton</th>
            <th className={TH}>Start sew</th>
            <th className={TH}>End sew</th>
            <th className={TH}>End pack</th>
            <th className={`${TH} text-right`}>Order</th>
            <th className={`${TH} text-right`}>Allocate</th>
            <th className={`${TH} text-right`}>Cut</th>
            <th className={`${TH} text-right`}>Sew</th>
            <th className={`${TH} text-right`}>Pack</th>
            <th className={`${TH} text-right`}>Pack-cut</th>
            <th
              className={`${TH} text-right`}
              title="Chưa xong pack: số ngày từ End sew đến hôm nay. Đã xong pack: số ngày làm việc (trừ Chủ nhật) từ End sew đến End pack, trừ 1 - giống cột late của file daily."
            >
              Late
            </th>
            <th className={TH}>EX remark</th>
            <th className={TH}>FIN remark</th>
            <th className={TH}>Nguồn</th>
            <th className={TH}>Cust. Style</th>
            <th className={TH}>WF</th>
            <th className={TH} />
          </tr>
        </thead>
        <tbody>
          {groups.map(([name, orders]) => (
            <Fragment key={name}>
              <tr>
                {/* Sticks just under the header row, so the Executive stays visible while scrolling through their orders. */}
                <td colSpan={COLUMN_COUNT} className="sticky top-[31px] z-[15] border-b border-border bg-primary-soft px-0 py-2">
                  <div className="sticky left-0 inline-flex items-center gap-2 px-3">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: name === UNASSIGNED ? "#94a3b8" : execColor(name).solid }}
                    />
                    <span className="text-sm font-semibold">{name}</span>
                    <span className="text-muted">{orders.length} đơn</span>
                    {name === UNASSIGNED ? (
                      <span className="text-muted">
                        - line chưa có trong Cấu hình Line: {[...new Set(orders.map((o) => o.line_number))].join(", ")}
                      </span>
                    ) : null}
                  </div>
                </td>
              </tr>
              {orders.map((o, i) => (
                <tr
                  key={`${o.order_key}|${o.source_owner}|${i}`}
                  className={`${o.bpo_level ? ROW_BG[o.bpo_level] : "bg-surface"} ${
                    o.is_closed ? "text-muted line-through decoration-muted/50" : ""
                  }`}
                >
                  <td
                    className={`${cell(0).className} ${o.bpo_level ? ROW_ACCENT[o.bpo_level] : ""}`}
                    style={cell(0).style}
                  >
                    <span className="font-semibold">{o.line_number}</span>
                  </td>
                  <td {...cell(1)} title={o.buyer ?? undefined}>
                    {o.buyer}
                  </td>
                  <td {...cell(2)} title={o.jo}>
                    <span className="font-medium">{o.jo}</span>
                  </td>
                  <td {...cell(3)} title={o.color ?? undefined}>
                    {o.color}
                  </td>
                  <td className={`${TD} font-medium`}>{shortDate(o.bpo_date)}</td>
                  <td className={TD}>
                    <BpoBadge order={o} />
                  </td>
                  <td className={TD}>{shortDate(o.shipment_plan)}</td>
                  <td className={TD}>{shortDate(o.order_carton)}</td>
                  <td className={TD}>{shortDate(o.start_sew)}</td>
                  <td className={TD}>{shortDate(o.end_sew)}</td>
                  <td className={TD}>{shortDate(o.end_pack)}</td>
                  {QTY_FIELDS.map((field) => (
                    <NumberCell key={field} order={o} field={field} canEdit={canEditNumbers} onSave={onNumber} />
                  ))}
                  <td
                    className={`${TD} text-right font-semibold tabular-nums ${
                      o.pack_cut < 0 ? "text-danger" : o.pack_cut > 0 ? "text-success" : "text-muted"
                    } ${o.edited?.pack_qty || o.edited?.cut_qty ? "bg-warning-soft" : ""}`}
                    title={o.edited?.pack_qty || o.edited?.cut_qty ? "Tính lại theo số Pack/Cut đã sửa tay" : undefined}
                  >
                    {num(o.pack_cut)}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {(() => {
                      const shown =
                        lateLevel(o) === "late" ? (
                      <span className="font-bold text-danger" title={`Late ${o.late} ngày (quá ${LATE_LIMIT} ngày kể từ End sew)`}>
                        {o.late}
                      </span>
                    ) : lateLevel(o) === "risk" ? (
                      <span
                        className="inline-flex items-center gap-1 font-semibold text-warning"
                        title={`Nguy cơ late: đã ${o.late} ngày từ End sew, quá ${LATE_LIMIT} ngày là late`}
                      >
                        <TriangleAlert size={12} /> {o.late}
                      </span>
                    ) : o.late != null ? (
                      o.late
                    ) : (
                      <span className="text-muted">{o.late_label ?? "-"}</span>
                    );
                      return canEditLate ? (
                        <LateInput order={o} onSave={(v) => onUpdate(o, { late: v })}>
                          {shown}
                        </LateInput>
                      ) : (
                        shown
                      );
                    })()}
                  </td>
                  <td className="border-b border-border px-1 py-1">
                    <RemarkCell value={o.ex_remark} onSave={(t) => onUpdate(o, { ex_remark: t })} />
                  </td>
                  <td className="border-b border-border px-1 py-1">
                    <RemarkCell value={o.fin_remark} onSave={(t) => onUpdate(o, { fin_remark: t })} />
                  </td>
                  <td className={`${TD} text-muted`}>{o.source_owner}</td>
                  <td className={TD}>{o.cust_style_no}</td>
                  <td className={TD}>{o.product_category}</td>
                  <td className={`${TD} text-right no-underline`}>
                    <CloseToggle order={o} onUpdate={onUpdate} />
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProgressContent() {
  const { user } = useAuth();
  const isExecutive = user?.role === "executive";
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [executive, setExecutive] = useState("");
  const [line, setLine] = useState("");
  const [onlyShort, setOnlyShort] = useState(false);
  const [lateFilter, setLateFilter] = useState<"" | "late" | "risk">("");
  const [bpoFilter, setBpoFilter] = useState<"" | BpoLevel>("");
  const savedView = useSavedView();
  const view: ViewMode = savedView ?? (user?.role === "finishing" ? "full" : "compact");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const load = useCallback(() => {
    api
      .getProgress(includeClosed)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Không tải được dữ liệu"));
  }, [includeClosed]);

  useEffect(() => {
    load();
  }, [load]);

  const onUpdate = useCallback(
    async (order: ProgressOrder, patch: Omit<ProgressNoteUpdate, "order_key">) => {
      let note;
      try {
        note = await api.updateProgressNote({ order_key: order.order_key, ...patch });
      } catch (err) {
        // Remark cells show their own error; closing has no other feedback.
        if (patch.is_closed !== undefined) alert(err instanceof ApiError ? err.message : "Không cập nhật được đơn");
        throw err;
      }
      setData((prev) => {
        if (!prev) return prev;
        const closedDelta = note.is_closed === order.is_closed ? 0 : note.is_closed ? 1 : -1;
        const orders = prev.orders.flatMap((o) => {
          if (o.order_key !== note.order_key) return [o];
          const updated = {
            ...o,
            ex_remark: note.ex_remark,
            fin_remark: note.fin_remark,
            is_closed: note.is_closed,
            closed_by: note.closed_by,
            closed_at: note.closed_at,
          };
          // A closed order leaves the list unless closed orders are shown.
          return updated.is_closed && !includeClosed ? [] : [updated];
        });
        return { ...prev, orders, closed_count: prev.closed_count + closedDelta };
      });
      // The computed late value/label come from the server.
      if ("late" in patch) load();
    },
    [includeClosed, load]
  );

  const onNumber = useCallback<NumberSave>(
    async (order, field, value) => {
      await api.setProgressNumber({ order_key: order.order_key, field, value });
      // Pack-cut is recomputed on the server - fetch the corrected rows.
      load();
    },
    [load]
  );

  const executives = useMemo(() => {
    const names: string[] = [];
    for (const o of data?.orders ?? []) {
      const n = o.executive_name ?? UNASSIGNED;
      if (!names.includes(n)) names.push(n);
    }
    return names;
  }, [data]);

  const lines = useMemo(() => {
    const set = new Set<string>();
    for (const o of data?.orders ?? []) {
      if (!executive || (o.executive_name ?? UNASSIGNED) === executive) set.add(o.line_number);
    }
    return [...set].sort();
  }, [data, executive]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.orders ?? []).filter((o) => {
      if (executive && (o.executive_name ?? UNASSIGNED) !== executive) return false;
      if (line && o.line_number !== line) return false;
      if (onlyShort && o.pack_cut >= 0) return false;
      if (lateFilter && lateLevel(o) !== lateFilter) return false;
      if (bpoFilter && o.bpo_level !== bpoFilter) return false;
      if (!q) return true;
      return [o.jo, o.buyer, o.color, o.cust_style_no, o.product_category, o.ex_remark, o.fin_remark]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [data, search, executive, line, onlyShort, lateFilter, bpoFilter]);

  // Counted over the rows the other filters leave, ignoring the late filter
  // itself, so the numbers don't collapse to the selected bucket.
  const { lateCounts, bpoCounts } = useMemo(() => {
    const late = { late: 0, risk: 0 };
    const bpo: Record<BpoLevel, number> = { overdue: 0, late: 0, soon: 0 };
    const q = search.trim().toLowerCase();
    for (const o of data?.orders ?? []) {
      if (executive && (o.executive_name ?? UNASSIGNED) !== executive) continue;
      if (line && o.line_number !== line) continue;
      if (q && ![o.jo, o.buyer, o.color, o.cust_style_no].some((v) => v?.toLowerCase().includes(q))) continue;
      const level = lateLevel(o);
      if (level) late[level]++;
      if (o.bpo_level) bpo[o.bpo_level]++;
    }
    return { lateCounts: late, bpoCounts: bpo };
  }, [data, search, executive, line]);

  const groups = useMemo(() => {
    const map = new Map<string, ProgressOrder[]>();
    for (const o of filtered) {
      const n = o.executive_name ?? UNASSIGNED;
      if (!map.has(n)) map.set(n, []);
      map.get(n)!.push(o);
    }
    const entries = [...map.entries()];
    if (view === "compact") {
      const rank = (o: ProgressOrder) => (o.bpo_level ? BPO_ORDER[o.bpo_level] : 3);
      for (const [, orders] of entries) {
        orders.sort(
          (a, b) =>
            rank(a) - rank(b) ||
            (a.bpo_deadline ?? a.bpo_date ?? "9999").localeCompare(b.bpo_deadline ?? b.bpo_date ?? "9999") ||
            a.line_number.localeCompare(b.line_number)
        );
      }
    }
    return entries;
  }, [filtered, view]);

  async function handleExport() {
    setExporting(true);
    try {
      await api.downloadProgressExcel();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Không xuất được file Excel");
    } finally {
      setExporting(false);
    }
  }

  const trackers = data?.sources.filter((s) => s.kind === "tracker") ?? [];
  const plan = data?.sources.find((s) => s.kind === "plan");
  const failed = data?.sources.filter((s) => !s.ok_on_last_run) ?? [];
  const staleDay = data?.updated_at ? data.updated_at.slice(0, 10) < todayISO() : false;

  return (
    <PageShell
      title="Tiến độ đơn hàng"
      description={
        isExecutive
          ? `Các đơn đang chạy trên line của ${user?.executive_name ?? "bạn"}, lấy từ bảng tiến độ (chưa End pack, Pack-cut khác 0 hoặc đã có Cut chưa có Sew)`
          : "Các đơn đang chạy, lấy từ bảng tiến độ của mọi người mỗi sáng (chưa End pack, Pack-cut khác 0 hoặc đã có Cut chưa có Sew)"
      }
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw size={14} /> Làm mới
          </Button>
          <Button size="sm" onClick={handleExport} disabled={exporting || !data}>
            <Download size={14} /> {exporting ? "Đang xuất..." : "Tải Excel"}
          </Button>
        </>
      }
    >
      <ProgressTabs />
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      {data ? (
        <div className="mb-4 space-y-2">
          <div
            className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 text-xs ${
              staleDay || failed.length ? "border-warning/40 bg-warning-soft/40" : "border-primary/20 bg-primary-soft/40"
            }`}
          >
            <span className="flex items-center gap-1.5 text-muted">
              {staleDay || failed.length ? (
                <TriangleAlert size={15} className="text-warning" />
              ) : (
                <Info size={15} className="text-primary" />
              )}
              Cập nhật lần cuối:
              <span className="font-semibold text-foreground">{data.updated_at ? dateTime(data.updated_at) : "chưa có"}</span>
              {staleDay ? <span className="font-medium text-warning">- chưa có dữ liệu sáng nay</span> : null}
            </span>
            {failed.length ? (
              <span className="font-medium text-warning">
                Không đọc được: {failed.map((s) => `${s.owner} (${errorHint(s.last_error)})`).join(", ")} - đang hiện số
                lần đọc được gần nhất, bấm &quot;Xem file nguồn&quot; để xem chi tiết
              </span>
            ) : null}
            <button type="button" onClick={() => setShowSources((v) => !v)} className="ml-auto text-primary hover:underline">
              {showSources ? "Ẩn danh sách file" : `Xem ${trackers.length} file nguồn`}
            </button>
          </div>
          {showSources ? (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-muted text-[11px] uppercase tracking-wide text-muted">
                    <th className={TH_PLAIN}>Người theo dõi</th>
                    <th className={TH_PLAIN}>File</th>
                    <th className={TH_PLAIN}>Sửa lần cuối</th>
                    <th className={TH_PLAIN}>Đọc được lúc</th>
                    <th className={`${TH_PLAIN} text-right`}>Số dòng</th>
                    <th className={TH_PLAIN}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {[...trackers, ...(plan ? [plan] : [])].map((s) => (
                    <tr key={s.file_name} className="border-b border-border last:border-0">
                      <td className={`${TD} font-medium`}>{s.owner}</td>
                      <td className={`${TD} text-muted`}>{s.file_name}</td>
                      <td className={TD}>{dateTime(s.file_modified_at)}</td>
                      <td className={TD}>{dateTime(s.last_ok_at)}</td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {s.row_count}
                        {s.kind === "plan" ? " JO" : ""}
                      </td>
                      <td className={TD}>
                        {s.ok_on_last_run ? (
                          <Badge tone="success">OK</Badge>
                        ) : (
                          <span className="flex items-center gap-2 whitespace-normal">
                            <Badge tone="danger">Lỗi</Badge>
                            <span className="text-danger">{errorHint(s.last_error)}</span>
                            <span className="text-muted">{s.last_error}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}
        </div>
      ) : null}

      {data && data.orders.length > 0 ? (
        <div className="mb-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(["overdue", "late", "soon"] as BpoLevel[]).map((level) => {
              const active = bpoFilter === level;
              const color =
                level === "soon"
                  ? "border-amber-200 text-amber-700"
                  : level === "overdue"
                    ? "border-red-200 text-red-700"
                    : "border-red-100 text-red-600";
              const dot = level === "soon" ? "#fcd34d" : level === "overdue" ? "#ef4444" : "#fca5a5";
              const hint =
                level === "overdue"
                  ? "Đã qua ngày BPO mà chưa End pack"
                  : level === "late"
                    ? "Đã qua hạn End sew hoặc hạn End pack mà chưa xong"
                    : "Còn ≤ 3 ngày làm việc tới hạn End sew / End pack";
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => setBpoFilter(active ? "" : level)}
                  aria-pressed={active}
                  className={`flex items-center justify-between gap-3 rounded-xl border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-muted ${color} ${
                    active ? "ring-2 ring-primary/40" : ""
                  }`}
                >
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />
                      {BPO_LABEL[level]}
                    </span>
                    <span className="block text-xs text-muted">{hint}</span>
                  </span>
                  <span className="text-2xl font-bold tabular-nums">{bpoCounts[level]}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              Cảnh báo theo BPO date: {BPO_RULE} Bấm vào ô để lọc.
            </span>
          </p>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm JO, buyer, màu, style, ghi chú..."
            className="pl-8"
          />
        </div>
        {!isExecutive ? (
          <Select
            value={executive}
            onChange={(e) => {
              setExecutive(e.target.value);
              setLine("");
            }}
            className="!w-auto"
          >
            <option value="">Tất cả Executive</option>
            {executives.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        ) : null}
        <Select value={line} onChange={(e) => setLine(e.target.value)} className="!w-auto">
          <option value="">Tất cả line</option>
          {lines.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        <Select value={bpoFilter} onChange={(e) => setBpoFilter(e.target.value as "" | BpoLevel)} className="!w-auto">
          <option value="">Mọi cảnh báo BPO</option>
          {(["overdue", "late", "soon"] as BpoLevel[]).map((level) => (
            <option key={level} value={level}>
              {BPO_LABEL[level]} ({bpoCounts[level]})
            </option>
          ))}
        </Select>
        <Select
          value={lateFilter}
          onChange={(e) => setLateFilter(e.target.value as "" | "late" | "risk")}
          className="!w-auto"
          title="Late tính từ End sew đến End pack (cột Late)"
        >
          <option value="">Late pack: tất cả</option>
          <option value="late">Late pack &gt; {LATE_LIMIT} ngày ({lateCounts.late})</option>
          <option value="risk">Nguy cơ late pack ({lateCounts.risk})</option>
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={onlyShort} onChange={(e) => setOnlyShort(e.target.checked)} />
          Chỉ đơn Pack-cut âm
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={includeClosed} onChange={(e) => setIncludeClosed(e.target.checked)} />
          Hiện đơn đã đóng{data?.closed_count ? ` (${data.closed_count})` : ""}
        </label>
        <span className="ml-auto flex items-center gap-3 text-sm text-muted">
          {data ? `${filtered.length} đơn` : ""}
          <span className="inline-flex overflow-hidden rounded-lg border border-border text-xs" role="group" aria-label="Kiểu xem">
            {(
              [
                ["compact", "Gọn"],
                ["full", "Đầy đủ"],
              ] as [ViewMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => saveView(mode)}
                aria-pressed={view === mode}
                title={mode === "compact" ? "Vừa màn hình, bấm vào đơn để xem chi tiết" : "Đủ mọi cột như Excel, sửa số / Late tại đây"}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  view === mode ? "bg-primary-soft text-primary" : "bg-surface text-muted hover:bg-surface-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </span>
        </span>
      </div>

      {!data && !error ? <p className="text-sm text-muted">Đang tải...</p> : null}
      {data && data.orders.length === 0 ? (
        <Card className="p-6 text-sm text-muted">
          Chưa có dữ liệu tiến độ. Dữ liệu được máy văn phòng gửi lên mỗi sáng lúc 9:00.
        </Card>
      ) : null}
      {data && data.orders.length > 0 && filtered.length === 0 ? (
        <Card className="p-6 text-sm text-muted">Không có đơn nào khớp bộ lọc.</Card>
      ) : null}

      {groups.length ? (
        <Card className="overflow-hidden p-0">
          {view === "compact" ? (
            <CompactTable groups={groups} onUpdate={onUpdate} />
          ) : (
            <OrdersTable
              groups={groups}
              onUpdate={onUpdate}
              canEditNumbers={data?.can_edit_numbers ?? false}
              canEditLate={data?.can_edit_late ?? false}
              onNumber={onNumber}
            />
          )}
        </Card>
      ) : null}
    </PageShell>
  );
}

export default function ProgressPage() {
  return (
    <RequireRole roles={["thu_ky", "sep", "executive", "finishing"]}>
      <ProgressContent />
    </RequireRole>
  );
}
