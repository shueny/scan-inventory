import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SCAN_ID } from "../config";
import type { ClassInfo, Instance, Issue } from "../data/types";
import { csvFileName, inventoryCsv } from "../domain/exportCsv";
import { filterInstances, isFiltering } from "../domain/filters";
import {
  countsByZoneAndClass,
  countsByZoneAndFamily,
  SHOWN_FAMILIES,
  pipeLengthByZone,
  reviewProgress,
  totalPipeLength,
  type Family,
} from "../domain/summary";
import { useViewStore } from "../state/viewStore";
import { SeverityBadge } from "./SeverityBadge";

// One hue per family, taken from the class palette's family ranges (class_palette.py).
const FAMILY_COLOR: Record<Family, string> = {
  valves: "#d1495b",
  instruments: "#2a9d8f",
  piping: "#3b6ea8",
  equipment: "#5e4b8b",
  other: "#7f7f7f",
};

const heading = "mb-2 text-xs font-medium tracking-wide text-muted uppercase";
const PCA_HELP =
  "Sum of PCA length estimates of the pipes. Pipes with an estimated diameter above 0.3 m " +
  "are probably bent or branched, so their length is not reliable.";

/**
 * Dashboard (PRD 8.5, demo step 8) and CSV export (demo step 9). All numbers come from
 * domain/summary.ts over the current instance list, so both data source modes agree.
 */
export function Dashboard({
  instances,
  issues,
  classes,
  zones,
}: {
  instances: Instance[];
  /** Undefined while loading or after a failure: only the open-issue counts need them. */
  issues: Issue[] | undefined;
  classes: ClassInfo[];
  zones: string[];
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const filters = useViewStore((s) => s.filters);
  const perZone = useMemo(() => countsByZoneAndFamily(instances, zones), [instances, zones]);
  const pipes = useMemo(() => pipeLengthByZone(instances, zones), [instances, zones]);
  const total = totalPipeLength(pipes);
  const progress = reviewProgress(instances, issues ?? []);
  const perClass = useMemo(() => countsByZoneAndClass(instances, zones), [instances, zones]);
  const className = (id: number) => classes.find((c) => c.id === id)?.name ?? String(id);
  const exportRows = useMemo(() => filterInstances(instances, filters), [instances, filters]);

  const chartData = perZone.map((r) => ({ zone: r.zone, ...r.counts }));
  const families = SHOWN_FAMILIES.filter((f) => perZone.some((r) => r.counts[f.id] > 0));

  const download = () => {
    const blob = new Blob([inventoryCsv(exportRows, classes)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFileName(SCAN_ID, new Date());
    // In the document while clicking, and the URL kept alive for a moment: Firefox and
    // Safari can cancel a download whose blob URL is revoked at once (review round 1).
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.75fr)] gap-3 overflow-auto px-3 py-2 text-sm">
      <figure className="flex min-h-0 flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <figcaption className={heading}>
            {view === "chart" ? "Objects per zone, by class family" : "Objects per zone and class"}
          </figcaption>
          <div className="flex gap-1 text-xs" role="group" aria-label="Show as">
            {(["chart", "table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`rounded px-2 py-0.5 whitespace-nowrap ${view === v ? "bg-ink text-white" : "hover:bg-canvas"}`}
              >
                {v === "chart" ? "Chart" : "Per class"}
              </button>
            ))}
          </div>
        </div>
        {view === "table" && (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-xs tabular-nums">
              <caption className="sr-only">Objects per zone and class</caption>
              <thead className="sticky top-0 bg-panel text-muted">
                <tr>
                  <th scope="col" className="text-left font-medium">
                    Class
                  </th>
                  {zones.map((z) => (
                    <th
                      key={z}
                      scope="col"
                      className="px-1 text-right font-medium whitespace-nowrap"
                    >
                      {z}
                    </th>
                  ))}
                  <th scope="col" className="pl-1 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {perClass.map((r) => (
                  <tr key={r.classId} className="border-t border-line/60">
                    <th scope="row" className="py-0.5 text-left font-normal">
                      {className(r.classId)}
                    </th>
                    {zones.map((z, n) => (
                      <td key={z} className="px-1 text-right">
                        {r.perZone[n] || ""}
                      </td>
                    ))}
                    <td className="pl-1 text-right font-medium">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={view === "chart" ? "min-h-36 flex-1" : "hidden"} aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              accessibilityLayer={false}
              data={chartData}
              margin={{ top: 4, right: 4, bottom: 0, left: -24 }}
            >
              <CartesianGrid vertical={false} stroke="#e3e6ea" />
              <XAxis dataKey="zone" tick={{ fontSize: 11 }} interval={0} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {families.map((f) => (
                <Bar
                  key={f.id}
                  dataKey={f.id}
                  name={f.label}
                  stackId="zone"
                  fill={FAMILY_COLOR[f.id]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* The same numbers as text, for screen readers (the chart itself is hidden). */}
        <table className="sr-only">
          <caption>Objects per zone, by class family</caption>
          <thead>
            <tr>
              <th scope="col">Zone</th>
              {families.map((f) => (
                <th key={f.id} scope="col">
                  {f.label}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {perZone.map((r) => (
              <tr key={r.zone}>
                <th scope="row">{r.zone}</th>
                {families.map((f) => (
                  <td key={f.id}>{r.counts[f.id]}</td>
                ))}
                <td>{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figure>

      <section aria-labelledby="pipes-heading" className="min-h-0">
        <h3 id="pipes-heading" className={heading}>
          Pipe length per zone{" "}
          <abbr
            title={PCA_HELP}
            className="cursor-help rounded bg-canvas px-1 py-0.5 normal-case no-underline"
          >
            estimate (PCA)
          </abbr>
        </h3>
        <table aria-labelledby="pipes-heading" className="w-full text-xs tabular-nums">
          <caption className="sr-only">
            Unreliable: pipes whose estimate is not reliable, and their share of the length
          </caption>
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="text-left font-medium">
                Zone
              </th>
              <th scope="col" className="text-right font-medium">
                Pipes
              </th>
              <th scope="col" className="text-right font-medium">
                Length
              </th>
              <th scope="col" className="text-right font-medium">
                <abbr title="Pipes with an unreliable estimate · their share of the length">
                  Unreliable
                </abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {[...pipes, total].map((r) => (
              <tr
                key={r.zone}
                className={r === total ? "border-t border-line font-medium" : undefined}
              >
                <th scope="row" className="py-0.5 text-left font-normal">
                  {r.zone}
                </th>
                <td className="text-right">{r.pipes}</td>
                <td className="text-right whitespace-nowrap">≈ {r.lengthM.toFixed(1)} m</td>
                <td className="text-right whitespace-nowrap">
                  {r.unreliablePipes > 0
                    ? `${r.unreliablePipes} · ${percent(r.unreliableLengthM, r.lengthM)}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="progress-heading" className="flex min-h-0 flex-col gap-3">
        {/* First, so it stays in view when the panel is short (1280 px, review round 1). */}
        <div>
          <button
            type="button"
            onClick={download}
            className="w-full rounded-md bg-ink px-3 py-1.5 text-sm text-white hover:opacity-90"
          >
            Export CSV ({exportRows.length} objects)
          </button>
          <p className="mt-1 text-xs text-muted">
            {isFiltering(filters)
              ? "Only the objects that pass the current filters, with their review status."
              : "Every object in the inventory, with its review status."}
          </p>
        </div>
        <div>
          <h3 id="progress-heading" className={heading}>
            Review progress
          </h3>
          <p>
            {progress.reviewed} of {progress.total} objects reviewed (
            {percent(progress.reviewed, progress.total)})
          </p>
          <progress
            value={progress.reviewed}
            max={progress.total}
            aria-label="Objects reviewed"
            className="mt-1 h-2 w-full accent-ink"
          />
        </div>
        <div>
          <h3 className={heading}>Open issues</h3>
          <ul className="flex flex-col gap-1">
            {(["high", "medium", "low"] as const).map((s) => (
              <li key={s} className="flex items-center justify-between">
                <SeverityBadge severity={s} />
                <span className="tabular-nums">{issues ? progress.openIssues[s] : "…"}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function percent(part: number, whole: number): string {
  return whole === 0 ? "0 %" : `${Math.round((100 * part) / whole)} %`;
}
