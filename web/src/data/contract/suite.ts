import {
  ConflictError,
  InvalidChangeError,
  NotFoundError,
  type ScanDataSource,
} from "../ScanDataSource";
import { SCAN } from "./fixtures";

/**
 * One contract for both data sources (PRD 6.1, ADR 0010). Every test runs against
 * ApiDataSource (real API, throwaway database) and StaticDataSource (fixture files,
 * events in memory), on the same fixture data. If a test passes for one and fails for
 * the other, the demo and local mode behave differently.
 *
 * `fresh()` returns a source whose data is back at the fixtures.
 */
export function contractSuite(name: string, fresh: () => Promise<ScanDataSource>): void {
  describe(`ScanDataSource contract: ${name}`, () => {
    let source: ScanDataSource;
    beforeEach(async () => {
      source = await fresh();
    });

    const ids = (rows: { instance_id: number }[]) => rows.map((r) => r.instance_id);

    // ------------------------------------------------------------ reads

    it("returns scan meta with class counts, zones and licence", async () => {
      const meta = await source.getScan(SCAN);

      expect(meta).toMatchObject({ scan_id: SCAN, instance_count: 6, licence: "CC BY 4.0" });
      expect(meta.zones).toEqual(["NW", "NE", "SW - SE"]);
      expect(meta.classes.find((c) => c.id === 8)).toMatchObject({
        name: "Pipe",
        instance_count: 1,
        is_background: false,
      });
      expect(meta.classes.find((c) => c.id === 0)?.is_background).toBe(true);
    });

    it("rejects an unknown scan with NotFoundError", async () => {
      await expect(source.getScan("nope")).rejects.toBeInstanceOf(NotFoundError);
      await expect(source.listInstances("nope")).rejects.toBeInstanceOf(NotFoundError);
      await expect(source.listIssues("nope")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("lists every object, background included, unreviewed, in id order", async () => {
      const instances = await source.listInstances(SCAN);

      expect(ids(instances)).toEqual([1, 2, 3, 4, 5, 6]);
      for (const i of instances) {
        expect(i.review_status).toBe("unreviewed");
        expect(i.current_class_id).toBe(i.class_id);
      }
      const transmitter = instances.find((i) => i.instance_id === 2);
      expect(transmitter?.class_name).toBe("Transmitter");
      expect(transmitter?.bbox_size[0]).toBeCloseTo(0.2, 4);
    });

    it("returns one object with all fields and an empty history", async () => {
      const detail = await source.getInstance(SCAN, 1);

      expect(detail).toMatchObject({
        instance_id: 1,
        tag: "PSV-1",
        element: "safety valve",
        nominal_inch: 2,
        system: "S - 1",
        location: "NE",
        location_source: "pnid",
        all_tags: ["PSV-1"],
      });
      expect(detail.history).toEqual([]);
      await expect(source.getInstance(SCAN, 999)).rejects.toBeInstanceOf(NotFoundError);
    });

    // ------------------------------------------------------------ PATCH

    it("confirms an object, records one event, and does nothing the second time", async () => {
      const after = await source.updateInstance(SCAN, 2, {
        review_status: "confirmed",
        note: "  checked on site  ",
      });

      expect(after.review_status).toBe("confirmed");
      expect(after.history).toHaveLength(1);
      expect(after.history[0]).toMatchObject({
        scan_id: SCAN,
        instance_id: 2,
        issue_id: null,
        action: "set_review_status",
        from_value: "unreviewed",
        to_value: "confirmed",
        note: "checked on site",
        actor: "local user",
      });
      expect(typeof after.history[0]?.id).toBe("number");
      expect(Number.isNaN(Date.parse(after.history[0]?.created_at ?? ""))).toBe(false);

      const again = await source.updateInstance(SCAN, 2, { review_status: "confirmed" });
      expect(again.history).toHaveLength(1);
    });

    it("changing the class marks the object corrected", async () => {
      const after = await source.updateInstance(SCAN, 3, { current_class_id: 1, note: " " });

      expect(after).toMatchObject({ current_class_id: 1, class_id: 8, review_status: "corrected" });
      expect(after.history.map((e) => [e.action, e.from_value, e.to_value, e.note])).toEqual([
        ["change_class", "8", "1", null],
        ["set_review_status", "unreviewed", "corrected", null],
      ]);
      const listed = (await source.listInstances(SCAN)).find((i) => i.instance_id === 3);
      expect(listed?.current_class_id).toBe(1);
    });

    it("rejects invalid changes and writes nothing", async () => {
      await expect(source.updateInstance(SCAN, 2, {})).rejects.toBeInstanceOf(InvalidChangeError);
      await expect(source.updateInstance(SCAN, 2, { current_class_id: 99 })).rejects.toBeInstanceOf(
        InvalidChangeError,
      );
      await expect(
        source.updateInstance(SCAN, 2, { review_status: "confirmed", note: "x".repeat(2001) }),
      ).rejects.toBeInstanceOf(InvalidChangeError);
      await expect(
        source.updateInstance(SCAN, 999, { review_status: "confirmed" }),
      ).rejects.toBeInstanceOf(NotFoundError);

      const detail = await source.getInstance(SCAN, 2);
      expect(detail).toMatchObject({ review_status: "unreviewed", current_class_id: 4 });
      expect(detail.history).toEqual([]);
    });

    // ------------------------------------------------------------ issues

    it("lists issues high to low severity, all open", async () => {
      const issues = await source.listIssues(SCAN);

      expect(issues.map((i) => i.issue_id)).toEqual([
        "class_mismatch:1",
        "tag_missing_in_scan:PT-9",
        "untagged_equipment:2",
        "tag_split:P-9",
        "estimate_unreliable:3",
      ]);
      expect(new Set(issues.map((i) => i.status))).toEqual(new Set(["open"]));
      expect(issues[2]?.candidate_tags[0]?.tag).toBe("PT-9");
    });

    it("accepting a class suggestion corrects the object and resolves the issue", async () => {
      const result = await source.resolveIssue(SCAN, "class_mismatch:1", {
        action: "accept_suggestion",
        note: "P&ID is right",
      });

      expect(result.issue.status).toBe("resolved");
      expect(result.instances).toHaveLength(1);
      expect(result.instances[0]).toMatchObject({
        instance_id: 1,
        current_class_id: 12,
        review_status: "corrected",
      });
      expect(
        result.instances[0]?.history.map((e) => [e.action, e.to_value, e.issue_id, e.note]),
      ).toEqual([
        ["change_class", "12", "class_mismatch:1", "P&ID is right"],
        ["set_review_status", "corrected", "class_mismatch:1", "P&ID is right"],
        ["close_issue", "resolved", "class_mismatch:1", "P&ID is right"],
      ]);
      const issue = (await source.listIssues(SCAN)).find((i) => i.issue_id === "class_mismatch:1");
      expect(issue?.status).toBe("resolved");
    });

    it("changes the class to one the reviewer picks", async () => {
      const result = await source.resolveIssue(SCAN, "estimate_unreliable:3", {
        action: "change_class",
        class_id: 1,
      });

      expect(result.instances[0]).toMatchObject({
        current_class_id: 1,
        review_status: "corrected",
      });
    });

    it("assigns a tag to an untagged object", async () => {
      const result = await source.resolveIssue(SCAN, "untagged_equipment:2", {
        action: "assign_tag",
        tag: " PT-9 ",
      });

      expect(result.instances[0]).toMatchObject({
        tag: "PT-9",
        all_tags: ["PT-9"],
        has_tag: true,
        review_status: "corrected",
      });
      expect(result.instances[0]?.history[0]).toMatchObject({
        action: "assign_tag",
        from_value: null,
        to_value: "PT-9",
      });
    });

    it("dismisses an issue that has no objects", async () => {
      const result = await source.resolveIssue(SCAN, "tag_missing_in_scan:PT-9", {
        action: "dismiss",
      });

      expect(result.issue.status).toBe("dismissed");
      expect(result.instances).toEqual([]);
    });

    it("rejects resolutions that do not fit the issue and writes nothing", async () => {
      const bad = [
        ["tag_split:P-9", { action: "accept_suggestion" }],
        ["tag_split:P-9", { action: "assign_tag", tag: "P-9" }],
        ["tag_split:P-9", { action: "change_class" }],
        ["untagged_equipment:2", { action: "assign_tag" }],
        ["untagged_equipment:2", { action: "assign_tag", tag: "   " }],
        ["class_mismatch:1", { action: "change_class", class_id: 99 }],
      ] as const;
      for (const [issueId, resolution] of bad) {
        await expect(source.resolveIssue(SCAN, issueId, resolution)).rejects.toBeInstanceOf(
          InvalidChangeError,
        );
      }

      const issues = await source.listIssues(SCAN);
      expect(issues.every((i) => i.status === "open")).toBe(true);
      for (const id of [1, 2, 6]) expect((await source.getInstance(SCAN, id)).history).toEqual([]);
    });

    it("resolving a closed issue is a conflict; an unknown issue is not found", async () => {
      await source.resolveIssue(SCAN, "tag_split:P-9", { action: "dismiss" });

      await expect(
        source.resolveIssue(SCAN, "tag_split:P-9", { action: "dismiss" }),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(
        source.resolveIssue(SCAN, "nope:1", { action: "dismiss" }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
}
