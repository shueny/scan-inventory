import type { Instance, ReviewStatus } from "../data/types";

/**
 * Inventory filters (PRD 8.4). The list is small (263 rows), so filtering, counting and
 * sorting happen here in the browser for both data sources (PRD 6.1).
 * `null` means "no restriction".
 */
export interface InstanceFilters {
  /** Zones to keep. Background objects have no zone and ignore this filter. */
  zones: string[] | null;
  /** A system name, or NO_SYSTEM for objects without one. */
  system: string | null;
  /** Current (possibly corrected) class ids to keep. */
  classIds: number[] | null;
  reviewStatus: ReviewStatus | null;
  /** Tag search: case-insensitive substring of any of the object's tags. */
  q: string;
  /** Structural and floor rows are hidden unless this is on. */
  includeBackground: boolean;
}

export const NO_SYSTEM = "__none__";

export const NO_FILTERS: InstanceFilters = {
  zones: null,
  system: null,
  classIds: null,
  reviewStatus: null,
  q: "",
  includeBackground: false,
};

export function matchesFilters(i: Instance, f: InstanceFilters): boolean {
  if (i.is_background) {
    if (!f.includeBackground) return false;
  } else if (f.zones !== null && !f.zones.includes(i.location ?? "")) {
    return false;
  }
  if (f.system !== null && (i.system ?? NO_SYSTEM) !== f.system) return false;
  if (f.classIds !== null && !f.classIds.includes(i.current_class_id)) return false;
  if (f.reviewStatus !== null && i.review_status !== f.reviewStatus) return false;
  const q = f.q.trim().toLowerCase();
  if (q && !i.all_tags.some((t) => t.toLowerCase().includes(q))) return false;
  return true;
}

export function filterInstances(list: readonly Instance[], f: InstanceFilters): Instance[] {
  return list.filter((i) => matchesFilters(i, f));
}

/** True when any filter hides an object (the background toggle alone does not count). */
export function isFiltering(f: InstanceFilters): boolean {
  return (
    f.zones !== null ||
    f.system !== null ||
    f.classIds !== null ||
    f.reviewStatus !== null ||
    f.q.trim() !== ""
  );
}

function countBy<K>(list: readonly Instance[], key: (i: Instance) => K): Map<K, number> {
  const counts = new Map<K, number>();
  for (const i of list) counts.set(key(i), (counts.get(key(i)) ?? 0) + 1);
  return counts;
}

/** Objects per zone (background has no zone and is not counted). */
export function zoneCounts(list: readonly Instance[]): Map<string, number> {
  return countBy(
    list.filter((i) => !i.is_background && i.location !== null),
    (i) => i.location ?? "",
  );
}

/** Objects per current class, so a corrected object counts in its new class. */
export function classCounts(list: readonly Instance[]): Map<number, number> {
  return countBy(list, (i) => i.current_class_id);
}

/** System names in the list, sorted, without the empty one. */
export function systemNames(list: readonly Instance[]): string[] {
  const names = new Set<string>();
  for (const i of list) if (i.system) names.add(i.system);
  return [...names].sort();
}

/** Turn one item of a "null = all" list on or off. */
export function toggleIn<T>(selected: T[] | null, all: readonly T[], item: T): T[] | null {
  const current = selected ?? [...all];
  const next = current.includes(item) ? current.filter((x) => x !== item) : [...current, item];
  return next.length === all.length && all.every((x) => next.includes(x)) ? null : next;
}

// ---------------------------------------------------------------- sorting

export type SortKey = "tag" | "class" | "element" | "size" | "zone" | "system" | "review";
export interface Sort {
  key: SortKey;
  dir: "asc" | "desc";
}

const REVIEW_ORDER: Record<ReviewStatus, number> = {
  unreviewed: 0,
  confirmed: 1,
  corrected: 2,
  rejected: 3,
};

/**
 * Sorted copy. Empty values (no tag, no size) always go last, in both directions;
 * ties keep the instance id order so the table never jumps.
 */
export function sortInstances(
  list: readonly Instance[],
  sort: Sort,
  className: (classId: number) => string,
): Instance[] {
  const value = (i: Instance): string | number | null => {
    switch (sort.key) {
      case "tag":
        return i.tag;
      case "class":
        return className(i.current_class_id);
      case "element":
        return i.element;
      case "size":
        return i.nominal_inch;
      case "zone":
        return i.location;
      case "system":
        return i.system;
      case "review":
        return REVIEW_ORDER[i.review_status];
    }
  };
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) {
      if (va === vb) return a.instance_id - b.instance_id;
      return va === null ? 1 : -1;
    }
    const cmp =
      typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), undefined, { numeric: true });
    return cmp !== 0 ? sign * cmp : a.instance_id - b.instance_id;
  });
}
