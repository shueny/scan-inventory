import type { ClassInfo, ReviewEvent, ReviewStatus } from "../data/types";
import { reviewLabel } from "./ReviewStatusBadge";

const heading = "mb-1 text-xs font-medium tracking-wide text-muted uppercase";

/** One history entry in plain words, e.g. "Class: Pipe → Piping components". */
export function describeEvent(e: ReviewEvent, classes: ClassInfo[]): string {
  const className = (v: string | null) => classes.find((c) => String(c.id) === v)?.name ?? v ?? "—";
  switch (e.action) {
    case "set_review_status":
      return `Status: ${reviewLabel((e.from_value ?? "unreviewed") as ReviewStatus)} → ${reviewLabel(
        e.to_value as ReviewStatus,
      )}`;
    case "change_class":
      return `Class: ${className(e.from_value)} → ${className(e.to_value)}`;
    case "assign_tag":
      return `Tag assigned: ${e.to_value ?? "—"}`;
    case "close_issue":
      return `Issue ${e.issue_id ?? ""} ${e.to_value ?? "closed"}`;
    default:
      return `${e.action}: ${e.from_value ?? "—"} → ${e.to_value ?? "—"}`;
  }
}

/** Append-only history of one object, newest first (PRD 8.4). */
export function ReviewHistory({
  events,
  classes,
}: {
  events: ReviewEvent[];
  classes: ClassInfo[];
}) {
  return (
    <section aria-labelledby="history-heading">
      <h3 id="history-heading" className={heading}>
        History
      </h3>
      {events.length === 0 ? (
        <p className="text-sm text-muted">No review changes yet.</p>
      ) : (
        <ol className="flex flex-col gap-2 text-sm">
          {[...events].reverse().map((e) => (
            <li key={e.id} className="border-l-2 border-line pl-2">
              <p>{describeEvent(e, classes)}</p>
              {e.note && <p className="text-muted">“{e.note}”</p>}
              <p className="text-xs text-muted">
                <time dateTime={e.created_at}>{new Date(e.created_at).toLocaleString()}</time> ·{" "}
                {e.actor}
                {e.issue_id && e.action !== "close_issue" && <> · via issue {e.issue_id}</>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
