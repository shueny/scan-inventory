import type { Issue, IssueType, ReviewEvent, Severity } from "../data/types";

/**
 * Review queue rules (PRD 8.5): which actions an issue offers, and how the queue is
 * sorted and split into open and closed. Pure functions, tested in issues.test.ts.
 */

export type IssueAction = "accept_suggestion" | "change_class" | "assign_tag" | "dismiss";

/** Issue types where the reviewer may pick another class for the (single) object. */
const CLASS_CAN_CHANGE: ReadonlySet<IssueType> = new Set([
  "class_mismatch",
  "untagged_equipment",
  "estimate_unreliable",
]);

/**
 * The actions that fit an issue, in the order they are shown. Mirrors what the API
 * accepts (services.resolve_issue): a class suggestion can be accepted only if there is
 * one, a tag can be assigned only to exactly one object, and every issue can be dismissed.
 */
export function issueActions(issue: Issue): IssueAction[] {
  const one = issue.instance_ids.length === 1;
  const actions: IssueAction[] = [];
  if (issue.suggested_action === "change_class" && issue.suggested_class_id !== null) {
    actions.push("accept_suggestion");
  }
  if (issue.type === "untagged_equipment" && one) actions.push("assign_tag");
  if (CLASS_CAN_CHANGE.has(issue.type) && one) actions.push("change_class");
  actions.push("dismiss");
  return actions;
}

/** What "dismiss" means for each type, in the reviewer's words. */
export const DISMISS_LABEL: Record<IssueType, string> = {
  class_mismatch: "Reject: the annotation is right",
  tag_missing_in_scan: "Close: the tag is not in the scan",
  untagged_equipment: "Close: no tag needed",
  tag_split: "Close: both objects belong to this tag",
  estimate_unreliable: "Close: keep it as an estimate",
  zone_borrowed: "Close: the borrowed zone is right",
};

export const TYPE_LABEL: Record<IssueType, string> = {
  class_mismatch: "Class mismatch",
  tag_missing_in_scan: "Tag missing in scan",
  untagged_equipment: "Untagged equipment",
  tag_split: "Tag split",
  estimate_unreliable: "Estimate unreliable",
  zone_borrowed: "Zone borrowed",
};

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const TYPE_ORDER = Object.keys(TYPE_LABEL) as IssueType[];

/**
 * Sorted copy: high severity first, grouped by type within a severity (each type has one
 * severity in the pipeline, so this is also a grouping by type). Ties keep the order the
 * data source gave (the pipeline's order), so the list never jumps.
 */
export function sortIssues(issues: readonly Issue[]): Issue[] {
  const rank = (i: Issue) => SEVERITY_RANK[i.severity] * 100 + TYPE_ORDER.indexOf(i.type);
  return [...issues].sort((a, b) => rank(a) - rank(b));
}

export function isOpen(issue: Issue): boolean {
  return issue.status === "open";
}

/** Open issues per severity, for the tab badge and the dashboard. */
export function openBySeverity(issues: readonly Issue[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const i of issues) if (isOpen(i)) counts[i.severity] += 1;
  return counts;
}

/** The event that closed the issue (who and when), or null while it is open. */
export function closingEvent(issue: Issue): ReviewEvent | null {
  const closes = issue.history.filter((e) => e.action === "close_issue");
  return closes[closes.length - 1] ?? null;
}

/** Closed issues, most recently closed first. */
export function closedIssues(issues: readonly Issue[]): Issue[] {
  const when = (i: Issue) => closingEvent(i)?.created_at ?? "";
  return issues.filter((i) => !isOpen(i)).sort((a, b) => when(b).localeCompare(when(a)));
}
