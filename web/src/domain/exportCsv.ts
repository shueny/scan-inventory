import type { ClassInfo, Instance } from "../data/types";

/**
 * Inventory as CSV (PRD 8.5, demo step 9), built in the browser from the current
 * instance list, the same in both data source modes. RFC 4180: comma separated, fields
 * with a comma, quote or line break are quoted, quotes doubled, CRLF line ends. A UTF-8
 * byte order mark lets spreadsheet programs read accents and the "×" correctly.
 */

const COLUMNS: {
  header: string;
  value: (i: Instance, className: (id: number) => string) => unknown;
}[] = [
  { header: "instance_id", value: (i) => i.instance_id },
  { header: "tag", value: (i) => i.tag },
  { header: "all_tags", value: (i) => i.all_tags.join(" ") },
  { header: "class", value: (i, name) => name(i.current_class_id) },
  { header: "annotated_class", value: (i) => i.class_name },
  { header: "element", value: (i) => i.element },
  { header: "nominal_size_inch", value: (i) => i.nominal_inch },
  { header: "system", value: (i) => i.system },
  { header: "zone", value: (i) => i.location },
  { header: "zone_source", value: (i) => i.location_source },
  { header: "point_count", value: (i) => i.point_count },
  { header: "size_x_m", value: (i) => i.bbox_size[0] },
  { header: "size_y_m", value: (i) => i.bbox_size[1] },
  { header: "size_z_m", value: (i) => i.bbox_size[2] },
  { header: "length_estimate_m", value: (i) => i.length_est_m },
  { header: "diameter_estimate_m", value: (i) => i.diameter_est_m },
  { header: "review_status", value: (i) => i.review_status },
];

/** One CSV field. Text that a spreadsheet would run as a formula gets a leading quote. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function inventoryCsv(
  instances: readonly Instance[],
  classes: readonly ClassInfo[],
): string {
  const names = new Map(classes.map((c) => [c.id, c.name]));
  const name = (id: number) => names.get(id) ?? String(id);
  const lines = [
    COLUMNS.map((c) => c.header).join(","),
    ...[...instances]
      .sort((a, b) => a.instance_id - b.instance_id)
      .map((i) => COLUMNS.map((c) => csvField(c.value(i, name))).join(",")),
  ];
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

/** e.g. "nora-inventory-2026-10-09.csv" (local date). */
export function csvFileName(scanId: string, now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${scanId}-inventory-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}
