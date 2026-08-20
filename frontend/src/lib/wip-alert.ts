// Flags a line/group whose WIP trước PI (goods waiting before inspection/
// packing) has piled up beyond what's actually been finished (OUT-FIN Fin) -
// a sign the line is falling behind on finishing, not just sewing.
export function wipExceedsOutClass(
  wipPrePi: number | null | undefined,
  outFinFin: number | null | undefined
): string {
  if (wipPrePi === null || wipPrePi === undefined || outFinFin === null || outFinFin === undefined) return "";
  return wipPrePi > outFinFin ? "bg-danger-soft text-danger font-semibold" : "";
}
