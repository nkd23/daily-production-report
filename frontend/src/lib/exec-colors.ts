// One color per Executive (the person whose Tổ trưởng report up to them,
// not a Tổ trưởng themselves) so their lines are visually grouped in charts.
// Target bar = lighter tint, Thực tế bar = solid, of the same hue. Shared
// across every Dashboard-family page (tổng hợp, EFF-SEW, EFF-FIN) so an
// Executive keeps the same color everywhere.
export const EXEC_COLORS: Record<string, { light: string; solid: string }> = {
  "Ms Thảo": { light: "#fbbf24", solid: "#b45309" }, // amber
  "Ms Hương": { light: "#a78bfa", solid: "#5b21b6" }, // violet
  "Ms Doan": { light: "#34d399", solid: "#047857" }, // emerald
  "Ms Phương": { light: "#60a5fa", solid: "#1d4ed8" }, // blue
  "Ms Huệ": { light: "#f472b6", solid: "#be185d" }, // pink
};
export const FALLBACK_COLOR = { light: "#94a3b8", solid: "#334155" }; // slate, for any other Executive

export function execColor(name: string) {
  return EXEC_COLORS[name] ?? FALLBACK_COLOR;
}
