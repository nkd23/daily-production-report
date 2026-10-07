import { effClass } from "@/lib/eff-thresholds";
import { execColor } from "@/lib/exec-colors";
import { wipExceedsOutClass } from "@/lib/wip-alert";
import type { GroupSummary } from "@/lib/types";

// Only the Executive subtotal rows get color-coded here - PU/TTL rows are
// aggregates of aggregates and not meaningful against a single target_eff.
function effCellClass(actual: number | null, target: number | null, level: string) {
  return level !== "executive" ? "" : effClass(actual, target);
}

export function SummaryTable({
  rows,
  emptyText,
  wipHeaderSuffix = "",
  showWipAlert = true,
}: {
  rows: GroupSummary[];
  emptyText: string;
  wipHeaderSuffix?: string;
  // Off for weekly totals: end-of-week stock vs a whole week's output isn't
  // the same comparison as one day's stock vs that day's output.
  showWipAlert?: boolean;
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-2 font-medium">Executive / PU</th>
            <th className="px-4 py-2 text-right font-medium">Target OUT</th>
            <th className="px-4 py-2 text-right font-medium">Target EFF</th>
            <th className="px-4 py-2 text-right font-medium">SAM</th>
            <th className="px-4 py-2 text-right font-medium">Số ca</th>
            <th className="px-4 py-2 text-right font-medium">OUT-SEW</th>
            <th className="px-4 py-2 text-right font-medium">EFF-SEW</th>
            <th className="px-4 py-2 text-right font-medium">OUT-FIN (Scan)</th>
            <th className="px-4 py-2 text-right font-medium">OUT-FIN (Fin)</th>
            <th className="px-4 py-2 text-right font-medium">EFF-FIN</th>
            <th className="px-4 py-2 text-right font-medium">VAR</th>
            <th className="px-4 py-2 text-right font-medium">Tồn Dip{wipHeaderSuffix}</th>
            <th className="px-4 py-2 text-right font-medium">Tồn trước PI{wipHeaderSuffix}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            // On the TTL row (already bg-primary) the danger tint would be
            // invisible - fall back to a bold underline so it still reads as a flag.
            const wipAlert = showWipAlert ? wipExceedsOutClass(row.wip_pre_pi, row.out_fin_fin) : "";
            const wipCellCls =
              row.level === "ttl" && wipAlert ? "underline decoration-2 underline-offset-2 font-bold" : wipAlert;
            return (
              <tr
                key={idx}
                className={
                  row.level === "ttl"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : row.level === "pu"
                      ? "border-b border-border bg-surface-muted font-semibold"
                      : "border-b border-border"
                }
              >
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    {row.level === "executive" ? (
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: execColor(row.label).solid }}
                      />
                    ) : null}
                    {row.label}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">{row.target_output ? row.target_output.toLocaleString("vi-VN") : "-"}</td>
                <td className="px-4 py-2 text-right">{row.target_eff_avg !== null ? `${row.target_eff_avg}%` : "-"}</td>
                <td className="px-4 py-2 text-right">{row.sam_avg ?? "-"}</td>
                <td className="px-4 py-2 text-right">{row.shift_total || "-"}</td>
                <td className="px-4 py-2 text-right">{row.out_sew.toLocaleString("vi-VN")}</td>
                <td className="px-4 py-2 text-right">{row.eff_sew_avg !== null ? `${row.eff_sew_avg}%` : "-"}</td>
                <td className="px-4 py-2 text-right">{row.out_fin_scanpack.toLocaleString("vi-VN")}</td>
                <td className={`px-4 py-2 text-right ${wipCellCls}`}>{row.out_fin_fin.toLocaleString("vi-VN")}</td>
                <td className={`px-4 py-2 text-right ${effCellClass(row.eff_fin_avg, row.target_eff_avg, row.level)}`}>
                  {row.eff_fin_avg !== null ? `${row.eff_fin_avg}%` : "-"}
                </td>
                <td className={`px-4 py-2 text-right ${row.var < 0 && row.level === "executive" ? "text-danger font-semibold" : ""}`}>
                  {row.var.toLocaleString("vi-VN")}
                </td>
                <td className="px-4 py-2 text-right">{row.wip_dip.toLocaleString("vi-VN")}</td>
                <td
                  className={`px-4 py-2 text-right ${wipCellCls}`}
                  title={wipAlert ? "Tồn trước PI đang nhiều hơn OUT-FIN (Fin)" : undefined}
                >
                  {row.wip_pre_pi.toLocaleString("vi-VN")}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={13} className="px-4 py-8 text-center text-sm text-muted">
                {emptyText}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
