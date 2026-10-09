// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Instance, ScanMeta } from "../data/types";
import { countsByZoneAndFamily, familyOf, pipeLengthByZone, totalPipeLength } from "./summary";

// The real inventory is gitignored, so CI does not have it: the whole file is skipped
// there, and nothing is read while the tests are collected (review round 1 of T7).
// Where the data is present, check the dashboard numbers against the facts measured on it
// (PRD 5.3, 5.5, 5.6).
const dataDir = join(process.cwd(), "..", "data");
const present =
  existsSync(join(dataDir, "instances.json")) && existsSync(join(dataDir, "scan.json"));

describe.runIf(present)("dashboard on the real data", () => {
  let instances: Instance[] = [];
  let scan: ScanMeta;
  beforeAll(() => {
    const raw = JSON.parse(readFileSync(join(dataDir, "instances.json"), "utf8")) as {
      instances: Instance[];
    };
    instances = raw.instances.map((i) => ({ ...i, current_class_id: i.class_id }));
    scan = JSON.parse(readFileSync(join(dataDir, "scan.json"), "utf8")) as ScanMeta;
  });

  it("matches PRD 5.5: 85 pipes, 110.2 m, 24 unreliable, and the per-zone split", () => {
    const rows = pipeLengthByZone(instances, scan.zones);
    const total = totalPipeLength(rows);
    expect(total.pipes).toBe(85);
    expect(total.lengthM).toBeCloseTo(110.24, 2);
    expect(total.unreliablePipes).toBe(24);
    expect(rows.map((r) => [r.zone, r.pipes, Math.round(r.lengthM * 10) / 10])).toEqual([
      ["NW", 18, 22.4],
      ["NC", 5, 6.6],
      ["NE", 16, 15.0],
      ["SW", 5, 3.6],
      ["SC", 28, 46.8],
      ["SE", 2, 3.2],
      ["SW - SE", 11, 12.7],
    ]);
  });

  it("puts every object class of the scan in a named family", () => {
    for (const c of scan.classes.filter((c) => !c.is_background)) {
      expect(familyOf(c.id), c.name).not.toBe("other");
    }
  });

  it("counts all 260 objects once, in the scan's zones", () => {
    const rows = countsByZoneAndFamily(instances, scan.zones);
    expect(rows.map((r) => r.zone)).toEqual(scan.zones);
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(260);
  });
});
