// Đạt = thực tế >= target; anything below is Không đạt. Simple binary
// classification, no separate warning/danger tier.
// Tailwind classes for an EFF value relative to its target - red when below
// target, plain otherwise.
export function effClass(actual: number | null, target: number | null): string {
  if (actual === null || !target) return "";
  return actual < target ? "bg-danger-soft text-danger font-semibold" : "";
}
