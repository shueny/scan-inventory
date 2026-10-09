import type { Instance, Issue, Severity } from "../data/types";
import { openBySeverity } from "./issues";

/**
 * Dashboard numbers (PRD 8.5), computed in the browser from the current instance list and
 * issues, the same way in both data source modes (PRD 6.1). Pure functions, tested in
 * summary.test.ts. Background objects (Structural, Floor) are never counted.
 */

/** Class families for the dashboard (PRD open question 2, ADR 0013). */
export type Family = "valves" | "instruments" | "piping" | "equipment" | "other";

export const FAMILIES: { id: Family; label: string; classIds: number[] }[] = [
  { id: "valves", label: "Valves", classIds: [1, 2, 9, 10, 11, 12, 22] },
  { id: "instruments", label: "Instruments", classIds: [3, 4] },
  { id: "piping", label: "Piping", classIds: [8, 20, 23] },
  { id: "equipment", label: "Equipment", classIds: [13, 14, 17] },
];

const FAMILY_OF = new Map(FAMILIES.flatMap((f) => f.classIds.map((id) => [id, f.id] as const)));

/**
 * The families as shown on the dashboard: the four above plus "Other", for an object
 * corrected to a class outside them (e.g. Structural). Without it such an object would be
 * in a zone's total but in no bar (review round 1 of T7).
 */
export const SHOWN_FAMILIES: { id: Family; label: string }[] = [
  ...FAMILIES,
  { id: "other", label: "Other" },
];

export function familyOf(classId: number): Family {
  return FAMILY_OF.get(classId) ?? "other";
}

/** The pipe class: estimated lengths are only summed for pipes. */
export const PIPE_CLASS_ID = 8;
/** Above this PCA diameter a "pipe" is probably bent or branched (PRD 5.6, 8.1 P2). */
export const UNRELIABLE_DIAMETER_M = 0.3;

const NO_ZONE = "—";
/**
 * The objects the inventory numbers count: not background, and not rejected (a reviewer
 * said it is not a real object; ADR 0013). Review progress still counts rejected ones as
 * reviewed.
 */
const counted = (list: readonly Instance[]) =>
  list.filter((i) => !i.is_background && i.review_status !== "rejected");
const objects = (list: readonly Instance[]) => list.filter((i) => !i.is_background);

export interface ZoneFamilyRow {
  zone: string;
  total: number;
  counts: Record<Family, number>;
}

/**
 * Objects per zone, split by class family of the current (possibly corrected) class.
 * Zones follow `zoneOrder` (the scan's display order); "SW - SE" stays its own zone
 * (PRD 5.6 item 7, open question 3).
 */
export function countsByZoneAndFamily(
  list: readonly Instance[],
  zoneOrder: readonly string[],
): ZoneFamilyRow[] {
  const rows = new Map<string, ZoneFamilyRow>();
  const row = (zone: string) => {
    let r = rows.get(zone);
    if (!r) {
      r = {
        zone,
        total: 0,
        counts: { valves: 0, instruments: 0, piping: 0, equipment: 0, other: 0 },
      };
      rows.set(zone, r);
    }
    return r;
  };
  zoneOrder.forEach(row);
  for (const i of counted(list)) {
    const r = row(i.location ?? NO_ZONE);
    r.counts[familyOf(i.current_class_id)] += 1;
    r.total += 1;
  }
  return [...rows.values()];
}

export interface ZoneClassRow {
  classId: number;
  /** Objects of this (current) class per zone, in zone order. */
  perZone: number[];
  total: number;
}

/**
 * Counts per zone × class (PRD 8.5), one row per current class that occurs, most common
 * first. The chart groups classes into families; this keeps the per-class numbers.
 */
export function countsByZoneAndClass(
  list: readonly Instance[],
  zoneOrder: readonly string[],
): ZoneClassRow[] {
  const zones = [...zoneOrder];
  const rows = new Map<number, ZoneClassRow>();
  for (const i of counted(list)) {
    const zone = i.location ?? NO_ZONE;
    if (!zones.includes(zone)) zones.push(zone);
    let r = rows.get(i.current_class_id);
    if (!r) {
      r = { classId: i.current_class_id, perZone: [], total: 0 };
      rows.set(i.current_class_id, r);
    }
    const z = zones.indexOf(zone);
    r.perZone[z] = (r.perZone[z] ?? 0) + 1;
    r.total += 1;
  }
  return [...rows.values()]
    .map((r) => ({ ...r, perZone: zones.map((_, z) => r.perZone[z] ?? 0) }))
    .sort((a, b) => b.total - a.total || a.classId - b.classId);
}

export interface PipeLengthRow {
  zone: string;
  pipes: number;
  /** Sum of the PCA length estimates, metres. */
  lengthM: number;
  /** Pipes whose estimate is not reliable (diameter above 0.3 m). */
  unreliablePipes: number;
  /** Part of lengthM that comes from unreliable pipes, metres. */
  unreliableLengthM: number;
}

/** Estimated pipe length per zone, with the unreliable share (PRD 8.5). Pipes = current class 8. */
export function pipeLengthByZone(
  list: readonly Instance[],
  zoneOrder: readonly string[],
): PipeLengthRow[] {
  const rows = new Map<string, PipeLengthRow>(
    zoneOrder.map((zone) => [
      zone,
      { zone, pipes: 0, lengthM: 0, unreliablePipes: 0, unreliableLengthM: 0 },
    ]),
  );
  for (const i of counted(list)) {
    if (i.current_class_id !== PIPE_CLASS_ID) continue;
    const zone = i.location ?? NO_ZONE;
    let r = rows.get(zone);
    if (!r) {
      r = { zone, pipes: 0, lengthM: 0, unreliablePipes: 0, unreliableLengthM: 0 };
      rows.set(zone, r);
    }
    const length = i.length_est_m ?? 0;
    r.pipes += 1;
    r.lengthM += length;
    if ((i.diameter_est_m ?? 0) > UNRELIABLE_DIAMETER_M) {
      r.unreliablePipes += 1;
      r.unreliableLengthM += length;
    }
  }
  return [...rows.values()];
}

/** Totals over all zones, for the table footer. */
export function totalPipeLength(rows: readonly PipeLengthRow[]): PipeLengthRow {
  return rows.reduce(
    (t, r) => ({
      zone: "All zones",
      pipes: t.pipes + r.pipes,
      lengthM: t.lengthM + r.lengthM,
      unreliablePipes: t.unreliablePipes + r.unreliablePipes,
      unreliableLengthM: t.unreliableLengthM + r.unreliableLengthM,
    }),
    { zone: "All zones", pipes: 0, lengthM: 0, unreliablePipes: 0, unreliableLengthM: 0 },
  );
}

export interface ReviewProgress {
  /** Objects (background excluded) whose review status is not "unreviewed". */
  reviewed: number;
  total: number;
  openIssues: Record<Severity, number>;
}

export function reviewProgress(
  list: readonly Instance[],
  issues: readonly Issue[],
): ReviewProgress {
  const all = objects(list);
  return {
    reviewed: all.filter((i) => i.review_status !== "unreviewed").length,
    total: all.length,
    openIssues: openBySeverity(issues),
  };
}
