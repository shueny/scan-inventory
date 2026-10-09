// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Instance } from "../data/types";
import { countsByZoneAndFamily, pipeLengthByZone, totalPipeLength } from "./summary";

// The real inventory is gitignored (CI does not have it). When it is there, check the
// dashboard numbers against the facts measured on it (PRD 5.5, 5.6).
const file = join(process.cwd(), "..", "data", "instances.json");

describe.runIf(existsSync(file))("dashboard on the real data", () => {
  const raw = JSON.parse(readFileSync(file, "utf8")) as { instances: Instance[] };
  const instances = raw.instances.map((i) => ({ ...i, current_class_id: i.class_id }));
  const zones = ["NW", "NC", "NE", "SW", "SC", "SE", "SW - SE"];

  it("matches PRD 5.5: 85 pipes, about 110 m, 24 unreliable (PRD 5.6 item 5)", () => {
    const total = totalPipeLength(pipeLengthByZone(instances, zones));
    expect(total.pipes).toBe(85);
    expect(total.lengthM).toBeCloseTo(110, -1);
    expect(total.unreliablePipes).toBe(24);
  });

  it("counts all 260 objects in the 7 zones", () => {
    const rows = countsByZoneAndFamily(instances, zones);
    expect(rows.map((r) => r.zone)).toEqual(zones);
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(260);
  });
});
