import type { Instance } from "../data/types";
import {
  NO_FILTERS,
  NO_SYSTEM,
  classCounts,
  filterInstances,
  isFiltering,
  sortInstances,
  systemNames,
  toggleIn,
  zoneCounts,
  type InstanceFilters,
} from "./filters";

function inst(id: number, fields: Partial<Instance> = {}): Instance {
  return {
    instance_id: id,
    is_background: false,
    location: "NW",
    system: null,
    current_class_id: 8,
    review_status: "unreviewed",
    tag: null,
    all_tags: [],
    element: null,
    nominal_inch: null,
    ...fields,
  } as Instance;
}

const list = [
  inst(1, { location: "NW", system: "S - 1", tag: "PSV-103A", all_tags: ["PSV-103A"] }),
  inst(2, { location: "NE", current_class_id: 3, review_status: "confirmed" }),
  inst(3, { location: "SW - SE", system: "S - 2", tag: "P-109A", all_tags: ["P-109A", "P-9"] }),
  inst(4, { is_background: true, location: null, current_class_id: 0 }),
];
const ids = (rows: Instance[]) => rows.map((r) => r.instance_id);
const f = (patch: Partial<InstanceFilters>): InstanceFilters => ({ ...NO_FILTERS, ...patch });

describe("filterInstances", () => {
  it("hides background unless asked, whatever the zone filter", () => {
    expect(ids(filterInstances(list, NO_FILTERS))).toEqual([1, 2, 3]);
    expect(ids(filterInstances(list, f({ includeBackground: true, zones: ["NE"] })))).toEqual([
      2, 4,
    ]);
  });

  it("filters by zone, system (including 'no system'), class and review status", () => {
    expect(ids(filterInstances(list, f({ zones: ["NW", "SW - SE"] })))).toEqual([1, 3]);
    expect(ids(filterInstances(list, f({ zones: [] })))).toEqual([]);
    expect(ids(filterInstances(list, f({ system: "S - 2" })))).toEqual([3]);
    expect(ids(filterInstances(list, f({ system: NO_SYSTEM })))).toEqual([2]);
    expect(ids(filterInstances(list, f({ classIds: [3] })))).toEqual([2]);
    expect(ids(filterInstances(list, f({ reviewStatus: "confirmed" })))).toEqual([2]);
  });

  it("searches every tag of an object, case-insensitive", () => {
    expect(ids(filterInstances(list, f({ q: " p-9 " })))).toEqual([3]);
    expect(ids(filterInstances(list, f({ q: "psv" })))).toEqual([1]);
  });

  it("knows when a filter is active", () => {
    expect(isFiltering(NO_FILTERS)).toBe(false);
    expect(isFiltering(f({ includeBackground: true }))).toBe(false);
    expect(isFiltering(f({ q: "x" }))).toBe(true);
  });
});

describe("counts and options", () => {
  it("counts objects per zone without background, and per current class", () => {
    expect(Object.fromEntries(zoneCounts(list))).toEqual({ NW: 1, NE: 1, "SW - SE": 1 });
    expect(classCounts(list).get(3)).toBe(1);
    expect(classCounts(list).get(8)).toBe(2);
  });

  it("lists system names without the empty one", () => {
    expect(systemNames(list)).toEqual(["S - 1", "S - 2"]);
  });

  it("toggles items of a null-means-all selection", () => {
    const all = ["a", "b", "c"];
    expect(toggleIn(null, all, "b")).toEqual(["a", "c"]);
    expect(toggleIn(["a", "c"], all, "b")).toBeNull();
  });
});

describe("sortInstances", () => {
  const name = (id: number) => ({ 0: "Structural", 3: "Pressure meter", 8: "Pipe" })[id] ?? "?";

  it("sorts by tag with untagged rows last in both directions", () => {
    expect(ids(sortInstances(list, { key: "tag", dir: "asc" }, name))).toEqual([3, 1, 2, 4]);
    expect(ids(sortInstances(list, { key: "tag", dir: "desc" }, name))).toEqual([1, 3, 2, 4]);
  });

  it("sorts by class name and by review progress", () => {
    expect(ids(sortInstances(list, { key: "class", dir: "asc" }, name))).toEqual([1, 3, 2, 4]);
    expect(ids(sortInstances(list, { key: "review", dir: "desc" }, name))).toEqual([2, 1, 3, 4]);
  });

  it("sorts sizes as numbers", () => {
    const sized = [inst(1, { nominal_inch: 10 }), inst(2, { nominal_inch: 2.5 })];
    expect(ids(sortInstances(sized, { key: "size", dir: "asc" }, name))).toEqual([2, 1]);
  });
});
