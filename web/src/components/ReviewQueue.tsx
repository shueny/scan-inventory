import { useMemo, useState } from "react";
import type { ClassInfo, Instance, Issue } from "../data/types";
import { closedIssues, isOpen, sortIssues, TYPE_LABEL } from "../domain/issues";
import { useViewStore } from "../state/viewStore";
import { IssuePanel } from "./IssuePanel";
import { SeverityBadge } from "./SeverityBadge";

type View = "open" | "closed";

/**
 * Review queue (PRD 8.5): open issues sorted high to low severity and grouped by type,
 * and the closed ones with who, when and what. Selecting an issue selects its first
 * object, so the 3D view flies there and the detail panel shows it.
 */
export function ReviewQueue({
  issues,
  instances,
  classes,
}: {
  issues: Issue[];
  instances: Instance[];
  classes: ClassInfo[];
}) {
  const [view, setView] = useState<View>("open");
  const selectedIssueId = useViewStore((s) => s.selectedIssueId);
  const selectIssue = useViewStore((s) => s.selectIssue);

  const open = useMemo(() => sortIssues(issues.filter(isOpen)), [issues]);
  const closed = useMemo(() => closedIssues(issues), [issues]);
  const shown = view === "open" ? open : closed;
  const selected = issues.find((i) => i.issue_id === selectedIssueId) ?? null;

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-h-0 flex-col border-r border-line">
        <div
          role="tablist"
          aria-label="Issue status"
          className="flex gap-1 border-b border-line px-2 py-1"
        >
          {(
            [
              ["open", `Open (${open.length})`],
              ["closed", `Resolved (${closed.length})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={`rounded px-2.5 py-1 text-xs ${
                view === value ? "bg-ink text-white" : "text-ink hover:bg-canvas"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="min-h-0 flex-1 overflow-auto">
          {shown.length === 0 ? (
            <p className="p-4 text-sm text-muted">
              {view === "open"
                ? "No open issues. Everything is reviewed."
                : "Nothing resolved yet."}
            </p>
          ) : (
            <IssueList
              issues={shown}
              grouped={view === "open"}
              selectedId={selectedIssueId}
              onSelect={(i) => selectIssue(i.issue_id, i.instance_ids[0] ?? null)}
            />
          )}
        </div>
      </div>
      <div className="min-h-0 overflow-auto p-3">
        {selected ? (
          <IssuePanel
            key={selected.issue_id}
            issue={selected}
            instances={instances}
            classes={classes}
          />
        ) : (
          <p className="text-sm text-muted">Select an issue to review it.</p>
        )}
      </div>
    </div>
  );
}

function IssueList({
  issues,
  grouped,
  selectedId,
  onSelect,
}: {
  issues: Issue[];
  grouped: boolean;
  selectedId: string | null;
  onSelect: (issue: Issue) => void;
}) {
  // Group headings ("High · Class mismatch") where severity or type changes.
  const groupOf = (i: Issue) => `${i.severity}|${i.type}`;
  return (
    <ul className="flex flex-col">
      {issues.map((issue, n) => {
        const heading = grouped && (n === 0 || groupOf(issues[n - 1] as Issue) !== groupOf(issue));
        const count = issues.filter((i) => groupOf(i) === groupOf(issue)).length;
        const selected = issue.issue_id === selectedId;
        return (
          <li key={issue.issue_id}>
            {heading && (
              <h3 className="sticky top-0 flex items-center gap-2 bg-panel px-3 pt-2 pb-1 text-xs font-medium text-muted">
                <SeverityBadge severity={issue.severity} />
                {TYPE_LABEL[issue.type]} ({count})
              </h3>
            )}
            <button
              type="button"
              aria-current={selected || undefined}
              onClick={() => onSelect(issue)}
              className={`flex w-full flex-col items-start border-b border-line/60 px-3 py-1.5 text-left text-sm ${
                selected ? "bg-accent/10" : "hover:bg-canvas"
              }`}
            >
              <span>{issue.title}</span>
              {!grouped && (
                <span className="text-xs text-muted">
                  {TYPE_LABEL[issue.type]} ·{" "}
                  {issue.status === "dismissed" ? "Dismissed" : "Resolved"}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
