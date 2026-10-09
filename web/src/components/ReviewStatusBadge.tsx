import type { ReviewStatus } from "../data/types";

// Text plus a mark, never colour alone (PRD 10, accessibility).
const STYLE: Record<ReviewStatus, { label: string; mark: string; className: string }> = {
  unreviewed: { label: "Unreviewed", mark: "○", className: "bg-canvas text-muted" },
  confirmed: { label: "Confirmed", mark: "✓", className: "bg-emerald-50 text-emerald-800" },
  corrected: { label: "Corrected", mark: "✎", className: "bg-amber-50 text-amber-800" },
  rejected: { label: "Rejected", mark: "✕", className: "bg-rose-50 text-rose-800" },
};

export const REVIEW_STATUSES = Object.keys(STYLE) as ReviewStatus[];

export function reviewLabel(status: ReviewStatus): string {
  return STYLE[status].label;
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const s = STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs whitespace-nowrap ${s.className}`}
    >
      <span aria-hidden>{s.mark}</span>
      {s.label}
    </span>
  );
}
