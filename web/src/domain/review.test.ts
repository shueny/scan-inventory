import type { Instance, Issue } from "../data/types";
import { cleanNote, planInstanceChange, replay, sortBySeverity, type ReviewState } from "./review";

const inst = { instance_id: 7, review_status: "unreviewed", current_class_id: 8 } as Instance;

function state(): ReviewState {
  return { instances: new Map([[7, { ...inst }]]), issues: new Map() };
}

describe("review rules", () => {
  it("replay builds a new state and leaves the base untouched", () => {
    const base = state();
    const events = planInstanceChange(base, "s", new Set([8, 9]), 7, { current_class_id: 9 });

    const next = replay(base, events);

    expect(next.instances.get(7)).toMatchObject({
      current_class_id: 9,
      review_status: "corrected",
    });
    expect(base.instances.get(7)).toMatchObject({
      current_class_id: 8,
      review_status: "unreviewed",
    });
  });

  it("planning alone changes nothing", () => {
    const base = state();
    planInstanceChange(base, "s", new Set([8]), 7, { review_status: "rejected" });

    expect(base.instances.get(7)?.review_status).toBe("unreviewed");
  });

  it("trims notes and turns blank ones into null", () => {
    expect(cleanNote("  ok  ")).toBe("ok");
    expect(cleanNote("   ")).toBeNull();
    expect(cleanNote(undefined)).toBeNull();
  });

  it("sorts issues high to low and keeps the file order within a severity", () => {
    const issue = (issue_id: string, severity: Issue["severity"]) =>
      ({ issue_id, severity }) as Issue;
    const sorted = sortBySeverity([
      issue("a", "low"),
      issue("b", "high"),
      issue("c", "low"),
      issue("d", "medium"),
      issue("e", "high"),
    ]);

    expect(sorted.map((i) => i.issue_id)).toEqual(["b", "e", "d", "a", "c"]);
  });
});
