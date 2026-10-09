import type { Severity } from "../data/types";

const SEVERITY_STYLE: Record<Severity, { label: string; mark: string; className: string }> = {
  high: { label: "High", mark: "▲", className: "bg-rose-50 text-rose-800" },
  medium: { label: "Medium", mark: "■", className: "bg-amber-50 text-amber-800" },
  low: { label: "Low", mark: "●", className: "bg-canvas text-muted" },
};

/** Severity as text plus a mark, never colour alone (PRD 10). */
export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${s.className}`}>
      <span aria-hidden>{s.mark}</span>
      {s.label}
    </span>
  );
}
