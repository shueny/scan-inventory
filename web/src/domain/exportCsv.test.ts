import type { ClassInfo, Instance } from "../data/types";
import { csvField, csvFileName, inventoryCsv } from "./exportCsv";

const classes = [
  { id: 8, name: "Pipe" },
  { id: 12, name: "Pressure safety valve" },
] as ClassInfo[];

const valve = {
  instance_id: 1,
  tag: "PSV-103A",
  all_tags: ["PSV-103A", "PSV-103B"],
  class_name: "Piping components",
  current_class_id: 12,
  element: 'safety valve 2"',
  nominal_inch: 2,
  system: "PVE - 103",
  location: "NW",
  location_source: "pnid",
  point_count: 9140,
  bbox_size: [0.26, 0.19, 0.31],
  length_est_m: 0.25,
  diameter_est_m: 0.15,
  review_status: "corrected",
} as Instance;

describe("csvField", () => {
  it("quotes commas, quotes and line breaks, and leaves empty values empty", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('2" valve')).toBe('"2"" valve"');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField(null)).toBe("");
    expect(csvField(0)).toBe("0");
  });

  it("defuses text a spreadsheet would run as a formula, but not numbers", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("@cmd")).toBe("'@cmd");
    expect(csvField(-0.5)).toBe("-0.5");
  });
});

describe("inventoryCsv", () => {
  it("writes a header and one row per object with the current class and review status", () => {
    const csv = inventoryCsv(
      [{ ...valve, instance_id: 7, tag: null, all_tags: [] }, valve],
      classes,
    );
    const [header, first, second] = csv.replace("\uFEFF", "").trimEnd().split("\r\n");

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(header?.split(",")).toContain("review_status");
    expect(first).toBe(
      '1,PSV-103A,PSV-103A PSV-103B,Pressure safety valve,Piping components,"safety valve 2"""' +
        ",2,PVE - 103,NW,pnid,9140,0.26,0.19,0.31,0.25,0.15,corrected",
    );
    expect(second?.startsWith("7,,,Pressure safety valve,")).toBe(true); // sorted by id
  });
});

describe("csvFileName", () => {
  it("uses the scan id and the local date", () => {
    expect(csvFileName("nora", new Date(2026, 9, 9, 23, 30))).toBe("nora-inventory-2026-10-09.csv");
  });
});
