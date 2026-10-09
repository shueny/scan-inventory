import { useEffect, useMemo, useRef } from "react";
import type { ClassInfo, Instance } from "../data/types";
import { filterInstances, sortInstances, type SortKey } from "../domain/filters";
import { useViewStore } from "../state/viewStore";
import { ReviewStatusBadge } from "./ReviewStatusBadge";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "tag", label: "Tag" },
  { key: "class", label: "Class" },
  { key: "element", label: "Element" },
  { key: "size", label: "Size (P&ID)" },
  { key: "zone", label: "Zone" },
  { key: "system", label: "System" },
  { key: "review", label: "Review" },
];

/**
 * Inventory table (PRD 8.4): the filtered objects, sortable by every column. Clicking a
 * row (or Enter on it) selects the object; the 3D view flies to it. A selection made in
 * 3D scrolls its row into view.
 */
export function InventoryTable({
  instances,
  classes,
}: {
  instances: Instance[];
  classes: ClassInfo[];
}) {
  const filters = useViewStore((s) => s.filters);
  const sort = useViewStore((s) => s.sort);
  const sortBy = useViewStore((s) => s.sortBy);
  const selectedId = useViewStore((s) => s.selectedId);
  const select = useViewStore((s) => s.select);

  const byId = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const rows = useMemo(() => {
    const name = (id: number) => byId.get(id)?.name ?? String(id);
    return sortInstances(filterInstances(instances, filters), sort, name);
  }, [instances, filters, sort, byId]);
  const total = instances.filter((i) => !i.is_background).length;

  const selectedRow = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    selectedRow.current?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="border-b border-line px-3 py-1.5 text-xs text-muted" aria-live="polite">
        {rows.length} of {total} objects
      </p>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-panel shadow-[0_1px_0_var(--color-line)]">
            <tr>
              {COLUMNS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className="px-3 py-1.5 text-left text-xs font-medium text-muted"
                  >
                    <button
                      type="button"
                      onClick={() => sortBy(c.key)}
                      className="inline-flex items-center gap-1 hover:text-ink"
                    >
                      {c.label}
                      <span aria-hidden className={active ? "text-ink" : "opacity-0"}>
                        {active && sort.dir === "desc" ? "▼" : "▲"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const selected = i.instance_id === selectedId;
              const cls = byId.get(i.current_class_id);
              return (
                <tr
                  key={i.instance_id}
                  ref={selected ? selectedRow : undefined}
                  tabIndex={0}
                  aria-selected={selected}
                  onClick={() => select(i.instance_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      select(i.instance_id);
                    }
                  }}
                  className={`cursor-pointer border-b border-line/60 ${
                    selected
                      ? "bg-accent/10 font-medium shadow-[inset_3px_0_0_var(--color-ink)]"
                      : "hover:bg-canvas"
                  }`}
                >
                  <td className="px-3 py-1 font-medium whitespace-nowrap">
                    {i.tag ?? <span className="font-normal text-muted">#{i.instance_id}</span>}
                  </td>
                  <td className="px-3 py-1">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-sm border border-black/10"
                        style={{ backgroundColor: cls?.color }}
                      />
                      {cls?.name ?? i.current_class_id}
                    </span>
                  </td>
                  <td className="px-3 py-1">{i.element ?? "—"}</td>
                  <td className="px-3 py-1 tabular-nums whitespace-nowrap">
                    {i.nominal_inch !== null ? `${i.nominal_inch}"` : "—"}
                  </td>
                  <td className="px-3 py-1 whitespace-nowrap">{i.location ?? "—"}</td>
                  <td className="px-3 py-1 whitespace-nowrap">{i.system ?? "—"}</td>
                  <td className="px-3 py-1">
                    <ReviewStatusBadge status={i.review_status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-4 text-sm text-muted">No object matches these filters.</p>
        )}
      </div>
    </div>
  );
}
