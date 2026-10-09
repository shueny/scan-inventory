import type { Issue, ReviewEvent } from "../data/types";
import { closedIssues, closingEvent, issueActions, openBySeverity, sortIssues } from "./issues";

function issue(fields: Partial<Issue>): Issue {
  return {
    issue_id: "x",
    type: "zone_borrowed",
    severity: "low",
    instance_ids: [1],
    tags: [],
    title: "",
    detail: "",
    suggested_action: null,
    suggested_class_id: null,
    candidate_tags: [],
    status: "open",
    history: [],
    ...fields,
  };
}

const close = (to: string, at: string) =>
  ({ action: "close_issue", to_value: to, created_at: at, actor: "local user" }) as ReviewEvent;

describe("issueActions", () => {
  it("offers the right actions for every issue type in PRD 5.6", () => {
    const cases: [Partial<Issue>, string[]][] = [
      [
        { type: "class_mismatch", suggested_action: "change_class", suggested_class_id: 12 },
        ["accept_suggestion", "change_class", "dismiss"],
      ],
      [{ type: "tag_missing_in_scan", instance_ids: [] }, ["dismiss"]],
      [
        { type: "untagged_equipment", suggested_action: "assign_tag" },
        ["assign_tag", "change_class", "dismiss"],
      ],
      [{ type: "tag_split", instance_ids: [175, 177] }, ["dismiss"]],
      [{ type: "estimate_unreliable" }, ["change_class", "dismiss"]],
      [{ type: "zone_borrowed" }, ["dismiss"]],
    ];
    for (const [fields, expected] of cases) expect(issueActions(issue(fields))).toEqual(expected);
  });

  it("never offers to accept a suggestion that is not there", () => {
    const noClass = issue({ type: "class_mismatch", suggested_action: "change_class" });
    expect(issueActions(noClass)).not.toContain("accept_suggestion");
  });
});

describe("sortIssues", () => {
  it("puts high severity first and groups types inside a severity, keeping data order", () => {
    const list = [
      issue({ issue_id: "zone", type: "zone_borrowed", severity: "low" }),
      issue({ issue_id: "untagged", type: "untagged_equipment", severity: "medium" }),
      issue({ issue_id: "split", type: "tag_split", severity: "low" }),
      issue({ issue_id: "class", type: "class_mismatch", severity: "high" }),
      issue({ issue_id: "missing", type: "tag_missing_in_scan", severity: "medium" }),
      issue({ issue_id: "split2", type: "tag_split", severity: "low" }),
    ];

    expect(sortIssues(list).map((i) => i.issue_id)).toEqual([
      "class",
      "missing",
      "untagged",
      "split",
      "split2",
      "zone",
    ]);
  });
});

describe("open and closed issues", () => {
  it("counts open issues per severity", () => {
    const list = [
      issue({ severity: "high" }),
      issue({ severity: "low" }),
      issue({ severity: "low", status: "resolved" }),
    ];
    expect(openBySeverity(list)).toEqual({ high: 1, medium: 0, low: 1 });
  });

  it("finds who closed an issue and when, and lists the newest closed first", () => {
    const early = issue({
      issue_id: "early",
      status: "dismissed",
      history: [close("dismissed", "2026-10-09T10:00:00Z")],
    });
    const late = issue({
      issue_id: "late",
      status: "resolved",
      history: [close("resolved", "2026-10-09T11:00:00Z")],
    });

    expect(closingEvent(late)?.created_at).toBe("2026-10-09T11:00:00Z");
    expect(closingEvent(issue({}))).toBeNull();
    expect(closedIssues([early, issue({}), late]).map((i) => i.issue_id)).toEqual([
      "late",
      "early",
    ]);
  });
});
