"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Info, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { RequireRole } from "@/components/RequireRole";
import { PageShell } from "@/components/PageShell";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { execColor } from "@/lib/exec-colors";
import type { ProgressNoteUpdate, ProgressOrder, ProgressResponse } from "@/lib/types";

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

const TH = "whitespace-nowrap px-2 py-2 font-medium";
const TD = "whitespace-nowrap px-2 py-1.5";

function OrdersTable({
  orders,
  onUpdate,
}: {
  orders: ProgressOrder[];
  onUpdate: (order: ProgressOrder, patch: Omit<ProgressNoteUpdate, "order_key">) => Promise<void>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border bg-surface-muted text-[11px] uppercase tracking-wide text-muted">
            <th className={`${TH} sticky left-0 z-10 bg-surface-muted`}>Line</th>
            <th className={TH}>Byr</th>
            <th className={TH}>JO</th>
            <th className={TH}>Màu</th>
            <th className={TH}>Cust. Style</th>
            <th className={TH}>WF</th>
            <th className={TH}>BPO</th>
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
          </tr>
        </thead>
        <tbody>
          {orders.map((o, i) => (
            <tr key={`${o.order_key}|${o.source_owner}|${i}`} className="border-b border-border last:border-0 hover:bg-primary-soft/20">
              <td className={`${TD} sticky left-0 z-10 bg-surface font-semibold`}>{o.line_number}</td>
              <td className={TD}>{o.buyer}</td>
              <td className={`${TD} font-medium`}>{o.jo}</td>
              <td className={`${TD} max-w-[8rem] truncate`} title={o.color ?? undefined}>
                {o.color}
              </td>
              <td className={TD}>{o.cust_style_no}</td>
              <td className={TD}>{o.product_category}</td>
              <td className={TD}>{shortDate(o.bpo_date)}</td>
              <td className={`${TD} font-medium`}>{shortDate(o.shipment_plan)}</td>
              <td className={TD}>{shortDate(o.order_carton)}</td>
              <td className={TD}>{shortDate(o.start_sew)}</td>
              <td className={TD}>{shortDate(o.end_sew)}</td>
              <td className={TD}>{shortDate(o.end_pack)}</td>
              <td className={`${TD} text-right tabular-nums`}>{num(o.order_qty)}</td>
              <td className={`${TD} text-right tabular-nums`}>{num(o.allocate_qty)}</td>
              <td className={`${TD} text-right tabular-nums`}>{num(o.cut_qty)}</td>
              <td className={`${TD} text-right tabular-nums`}>{num(o.sew_qty)}</td>
              <td className={`${TD} text-right tabular-nums`}>{num(o.pack_qty)}</td>
              <td className={`${TD} text-right font-semibold tabular-nums ${o.pack_cut < 0 ? "text-danger" : o.pack_cut > 0 ? "text-success" : "text-muted"}`}>
                {num(o.pack_cut)}
              </td>
              <td className={`${TD} text-right tabular-nums`}>
                {o.late != null ? o.late : <span className="text-muted">{o.late_label}</span>}
              </td>
              <td className="px-1 py-1">
                <RemarkCell value={o.ex_remark} onSave={(t) => onUpdate(o, { ex_remark: t })} />
              </td>
              <td className="px-1 py-1">
                <RemarkCell value={o.fin_remark} onSave={(t) => onUpdate(o, { fin_remark: t })} />
              </td>
              <td className={`${TD} text-muted`}>{o.source_owner}</td>
            </tr>
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
  const [exporting, setExporting] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const load = useCallback(() => {
    api
      .getProgress()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Không tải được dữ liệu"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onUpdate = useCallback(async (order: ProgressOrder, patch: Omit<ProgressNoteUpdate, "order_key">) => {
    const note = await api.updateProgressNote({ order_key: order.order_key, ...patch });
    setData((prev) =>
      prev
        ? {
            ...prev,
            orders: prev.orders.map((o) =>
              o.order_key === note.order_key ? { ...o, ex_remark: note.ex_remark, fin_remark: note.fin_remark } : o
            ),
          }
        : prev
    );
  }, []);

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
      if (!q) return true;
      return [o.jo, o.buyer, o.color, o.cust_style_no, o.product_category, o.ex_remark, o.fin_remark]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [data, search, executive, line, onlyShort]);

  const groups = useMemo(() => {
    const map = new Map<string, ProgressOrder[]>();
    for (const o of filtered) {
      const n = o.executive_name ?? UNASSIGNED;
      if (!map.has(n)) map.set(n, []);
      map.get(n)!.push(o);
    }
    return [...map.entries()];
  }, [filtered]);

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
          ? `Các đơn đang chạy trên line của ${user?.executive_name ?? "bạn"}, lấy từ bảng tiến độ (Pack-cut khác 0 hoặc đã có Cut chưa có Sew)`
          : "Các đơn đang chạy, lấy từ bảng tiến độ của mọi người mỗi sáng (Pack-cut khác 0 hoặc đã có Cut chưa có Sew)"
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
                Không đọc được: {failed.map((s) => s.owner).join(", ")} (đang hiện số lần đọc được gần nhất)
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
                    <th className={TH}>Người theo dõi</th>
                    <th className={TH}>File</th>
                    <th className={TH}>Sửa lần cuối</th>
                    <th className={TH}>Đọc được lúc</th>
                    <th className={`${TH} text-right`}>Số dòng</th>
                    <th className={TH}>Trạng thái</th>
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
                          <span title={s.last_error ?? undefined}>
                            <Badge tone="danger">Lỗi</Badge>
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
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={onlyShort} onChange={(e) => setOnlyShort(e.target.checked)} />
          Chỉ đơn Pack-cut âm
        </label>
        <span className="ml-auto text-sm text-muted">{data ? `${filtered.length} đơn` : ""}</span>
      </div>

      {!data && !error ? <p className="text-sm text-muted">Đang tải...</p> : null}
      {data && data.orders.length === 0 ? (
        <Card className="p-6 text-sm text-muted">
          Chưa có dữ liệu tiến độ. Dữ liệu được máy văn phòng gửi lên mỗi sáng lúc 9:30.
        </Card>
      ) : null}
      {data && data.orders.length > 0 && filtered.length === 0 ? (
        <Card className="p-6 text-sm text-muted">Không có đơn nào khớp bộ lọc.</Card>
      ) : null}

      <div className="space-y-5">
        {groups.map(([name, orders]) => (
          <Card key={name} className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: name === UNASSIGNED ? "#94a3b8" : execColor(name).solid }}
              />
              <h2 className="text-sm font-semibold">{name}</h2>
              <span className="text-xs text-muted">{orders.length} đơn</span>
              {name === UNASSIGNED ? (
                <span className="text-xs text-muted">
                  - line chưa có trong Cấu hình Line: {[...new Set(orders.map((o) => o.line_number))].join(", ")}
                </span>
              ) : null}
            </div>
            <OrdersTable orders={orders} onUpdate={onUpdate} />
          </Card>
        ))}
      </div>
    </PageShell>
  );
}

export default function ProgressPage() {
  return (
    <RequireRole roles={["thu_ky", "sep", "executive"]}>
      <ProgressContent />
    </RequireRole>
  );
}
