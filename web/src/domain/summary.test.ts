import type { Instance, Issue } from "../data/types";
import {
  countsByZoneAndClass,
  countsByZoneAndFamily,
  familyOf,
  FAMILIES,
  pipeLengthByZone,
  reviewProgress,
  totalPipeLength,
} from "./summary";

function inst(id: number, fields: Partial<Instance>): Instance {
  return {
    instance_id: id,
    is_background: false,
    location: "NW",
    current_class_id: 8,
    review_status: "unreviewed",
    length_est_m: null,
    diameter_est_m: null,
    ...fields,
  } as Instance;
}

describe("class families", () => {
  it("puts every object class of the scan in exactly one family", () => {
    const objectClasses = [1, 2, 3, 4, 8, 9, 10, 11, 12, 13, 14, 17, 20, 22, 23];
    const all = FAMILIES.flatMap((f) => f.classIds);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort((a, b) => a - b)).toEqual(objectClasses);
    expect(familyOf(12)).toBe("valves");
    expect(familyOf(99)).toBe("other");
  });
});

describe("countsByZoneAndFamily", () => {
  it("counts objects per zone and family, keeps zone order, skips background", () => {
    const rows = countsByZoneAndFamily(
      [
        inst(1, { location: "NE", current_class_id: 12 }),
        inst(2, { location: "NW", current_class_id: 3 }),
        inst(3, { location: "NW", current_class_id: 8 }),
        inst(4, { location: null, is_background: true, current_class_id: 0 }),
        inst(5, { location: "SW - SE", current_class_id: 13 }),
      ],
      ["NW", "NE", "SW", "SW - SE"],
    );

    expect(rows.map((r) => [r.zone, r.total])).toEqual([
      ["NW", 2],
      ["NE", 1],
      ["SW", 0],
      ["SW - SE", 1],
    ]);
    expect(rows[0]?.counts).toMatchObject({ instruments: 1, piping: 1, valves: 0 });
    expect(rows[3]?.counts.equipment).toBe(1);
  });

  it("counts a corrected object in its new family", () => {
    const [row] = countsByZoneAndFamily([inst(1, { current_class_id: 12, class_id: 20 })], ["NW"]);
    expect(row?.counts.valves).toBe(1);
    expect(row?.counts.piping).toBe(0);
  });
});

describe("pipe length", () => {
  const pipes = [
    inst(1, { location: "NW", length_est_m: 2.5, diameter_est_m: 0.1 }),
    inst(2, { location: "NW", length_est_m: 1.5, diameter_est_m: 0.31 }), // unreliable
    inst(3, { location: "NE", length_est_m: 4, diameter_est_m: 0.3 }), // exactly 0.3: reliable
    inst(4, { location: "NE", current_class_id: 23, length_est_m: 9 }), // flange, not a pipe
  ];

  it("sums estimated length per zone and the unreliable share", () => {
    const rows = pipeLengthByZone(pipes, ["NW", "NE", "SC"]);

    expect(rows).toEqual([
      { zone: "NW", pipes: 2, lengthM: 4, unreliablePipes: 1, unreliableLengthM: 1.5 },
      { zone: "NE", pipes: 1, lengthM: 4, unreliablePipes: 0, unreliableLengthM: 0 },
      { zone: "SC", pipes: 0, lengthM: 0, unreliablePipes: 0, unreliableLengthM: 0 },
    ]);
    expect(totalPipeLength(rows)).toMatchObject({ pipes: 3, lengthM: 8, unreliablePipes: 1 });
  });
});

describe("reviewProgress", () => {
  it("counts reviewed objects without background, and open issues per severity", () => {
    const progress = reviewProgress(
      [
        inst(1, { review_status: "confirmed" }),
        inst(2, { review_status: "unreviewed" }),
        inst(3, { review_status: "rejected", is_background: true }),
      ],
      [
        { severity: "high", status: "open" } as Issue,
        { severity: "low", status: "resolved" } as Issue,
      ],
    );

    expect(progress).toEqual({ reviewed: 1, total: 2, openIssues: { high: 1, medium: 0, low: 0 } });
  });
});

describe("objects that the numbers do not count", () => {
  it("counts an object corrected to a class outside the families as Other, in its zone total", () => {
    const [row] = countsByZoneAndFamily([inst(1, { current_class_id: 0, class_id: 12 })], ["NW"]);
    expect(row?.counts.other).toBe(1);
    expect(row?.total).toBe(1);
  });

  it("leaves rejected objects out of zone counts and pipe length, but counts them as reviewed", () => {
    const list = [
      inst(1, { review_status: "rejected", length_est_m: 5 }),
      inst(2, { review_status: "confirmed", length_est_m: 1 }),
    ];

    expect(countsByZoneAndFamily(list, ["NW"])[0]?.total).toBe(1);
    expect(totalPipeLength(pipeLengthByZone(list, ["NW"]))).toMatchObject({ pipes: 1, lengthM: 1 });
    expect(reviewProgress(list, [])).toMatchObject({ reviewed: 2, total: 2 });
  });
});

describe("countsByZoneAndClass", () => {
  it("counts per current class and zone, most common class first", () => {
    const rows = countsByZoneAndClass(
      [
        inst(1, { location: "NE", current_class_id: 12 }),
        inst(2, { location: "NW", current_class_id: 8 }),
        inst(3, { location: "NE", current_class_id: 8 }),
        inst(4, { location: null, is_background: true, current_class_id: 0 }),
      ],
      ["NW", "NE", "SW"],
    );

    expect(rows).toEqual([
      { classId: 8, perZone: [1, 1, 0], total: 2 },
      { classId: 12, perZone: [0, 1, 0], total: 1 },
    ]);
  });
});
