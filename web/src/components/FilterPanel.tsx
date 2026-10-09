import { useMemo } from "react";
import type { ClassInfo, Instance } from "../data/types";
import {
  NO_SYSTEM,
  classCounts,
  isFiltering,
  systemNames,
  toggleIn,
  zoneCounts,
} from "../domain/filters";
import { useViewStore, type ColorMode } from "../state/viewStore";
import { REVIEW_STATUSES, reviewLabel } from "./ReviewStatusBadge";

const MODES: { value: ColorMode; label: string }[] = [
  { value: "class", label: "Class" },
  { value: "rgb", label: "Scan colour" },
];

const heading = "mb-1.5 text-xs font-medium tracking-wide text-muted uppercase";

/**
 * Left panel (PRD 8.4): how the 3D view is coloured, and the inventory filters (zones,
 * system, class, review status, tag search). Everything goes through the shared store,
 * so the table, the detail panel and the 3D view follow.
 */
export function FilterPanel({
  classes,
  zones,
  instances,
}: {
  classes: ClassInfo[];
  zones: string[];
  instances: Instance[];
}) {
  const colorMode = useViewStore((s) => s.colorMode);
  const setColorMode = useViewStore((s) => s.setColorMode);
  const backgroundVisible = useViewStore((s) => s.backgroundVisible);
  const setBackgroundVisible = useViewStore((s) => s.setBackgroundVisible);
  const filters = useViewStore((s) => s.filters);
  const setFilters = useViewStore((s) => s.setFilters);
  const resetFilters = useViewStore((s) => s.resetFilters);

  const perZone = useMemo(() => zoneCounts(instances), [instances]);
  const perClass = useMemo(() => classCounts(instances), [instances]);
  const systems = useMemo(() => systemNames(instances), [instances]);
  const objectClasses = classes.filter((c) => !c.is_background);
  const background = classes.filter((c) => c.is_background);
  const objectClassIds = objectClasses.map((c) => c.id);

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className={heading}>Colour by</legend>
        <div className="inline-flex rounded-md border border-line p-0.5" role="radiogroup">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={colorMode === m.value}
              onClick={() => setColorMode(m.value)}
              className={`rounded px-2.5 py-1 text-sm ${
                colorMode === m.value ? "bg-ink text-white" : "text-ink hover:bg-canvas"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={backgroundVisible}
            onChange={(e) => setBackgroundVisible(e.target.checked)}
            className="size-4 accent-ink"
          />
          Show structure and floor
        </label>
      </fieldset>

      <div className="flex items-baseline justify-between border-t border-line pt-4">
        <h2 className="text-sm font-semibold">Filters</h2>
        {isFiltering(filters) && (
          <button type="button" onClick={resetFilters} className="text-xs text-accent underline">
            Clear all
          </button>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className={heading}>Tag search</span>
        <input
          type="search"
          value={filters.q}
          onChange={(e) => setFilters({ q: e.target.value })}
          placeholder="e.g. PSV-103A"
          className="rounded-md border border-line px-2 py-1"
        />
      </label>

      <fieldset>
        <legend className={heading}>Zones</legend>
        <ul className="flex flex-col">
          {zones.map((z) => (
            <li key={z}>
              <label className="flex items-center gap-2 py-0.5 text-sm">
                <input
                  type="checkbox"
                  checked={filters.zones === null || filters.zones.includes(z)}
                  onChange={() => setFilters({ zones: toggleIn(filters.zones, zones, z) })}
                  className="size-4 accent-ink"
                />
                <span className="flex-1">{z}</span>
                <span className="text-xs text-muted tabular-nums">{perZone.get(z) ?? 0}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className={heading}>System</span>
        <select
          value={filters.system ?? ""}
          onChange={(e) => setFilters({ system: e.target.value || null })}
          className="rounded-md border border-line px-2 py-1"
        >
          <option value="">All systems</option>
          {systems.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value={NO_SYSTEM}>No system</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className={heading}>Review status</span>
        <select
          value={filters.reviewStatus ?? ""}
          onChange={(e) =>
            setFilters({
              reviewStatus: REVIEW_STATUSES.find((s) => s === e.target.value) ?? null,
            })
          }
          className="rounded-md border border-line px-2 py-1"
        >
          <option value="">Any status</option>
          {REVIEW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {reviewLabel(s)}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className={heading}>Classes</legend>
        <ul className="flex flex-col">
          {objectClasses.map((c) => (
            <ClassRow
              key={c.id}
              cls={c}
              count={perClass.get(c.id) ?? 0}
              checked={filters.classIds === null || filters.classIds.includes(c.id)}
              onToggle={() =>
                setFilters({ classIds: toggleIn(filters.classIds, objectClassIds, c.id) })
              }
            />
          ))}
        </ul>
        <ul className="mt-2 flex flex-col border-t border-line pt-2">
          {background.map((c) => (
            <li
              key={c.id}
              className={`flex items-center gap-2 py-0.5 pl-6 text-sm ${backgroundVisible ? "" : "opacity-40"}`}
            >
              <Swatch color={c.color} />
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-xs text-muted tabular-nums">{perClass.get(c.id) ?? 0}</span>
            </li>
          ))}
        </ul>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.includeBackground}
            onChange={(e) => setFilters({ includeBackground: e.target.checked })}
            className="size-4 accent-ink"
          />
          List structure and floor in the table
        </label>
      </fieldset>
    </div>
  );
}

function ClassRow({
  cls,
  count,
  checked,
  onToggle,
}: {
  cls: ClassInfo;
  count: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <label className="flex items-center gap-2 py-0.5 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="size-4 accent-ink"
        />
        <Swatch color={cls.color} />
        <span className="flex-1 truncate">{cls.name}</span>
        <span className="text-xs text-muted tabular-nums">{count}</span>
      </label>
    </li>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="size-3 shrink-0 rounded-sm border border-black/10"
      style={{ backgroundColor: color }}
    />
  );
}
