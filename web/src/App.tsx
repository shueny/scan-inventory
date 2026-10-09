import { ClassLegend } from "./components/ClassLegend";
import { InstanceDetail } from "./components/InstanceDetail";
import { useInstance, useScan } from "./data/hooks";
import { useViewStore } from "./state/viewStore";
import { ViewerCanvas } from "./viewer/ViewerCanvas";

/** Three columns: filters, 3D, details (PRD 8.6). */
export function App() {
  const scan = useScan();
  const selectedId = useViewStore((s) => s.selectedId);
  const selected = useInstance(selectedId);

  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto]">
      <header className="flex items-baseline gap-3 border-b border-line bg-panel px-4 py-2.5">
        <h1 className="text-base font-semibold">scan-inventory</h1>
        {scan.data && (
          <p className="text-sm text-muted">
            {scan.data.name} · {scan.data.instance_count} objects ·{" "}
            {(scan.data.point_count / 1e6).toFixed(1)}M points
          </p>
        )}
      </header>

      <main className="grid min-h-0 grid-cols-[17rem_1fr_21rem]">
        <aside className="overflow-y-auto border-r border-line bg-panel p-4">
          {scan.data && <ClassLegend classes={scan.data.classes} />}
          {scan.isError && <p className="text-sm text-red-700">Could not load the scan data.</p>}
        </aside>

        <section aria-label="3D view" className="min-h-0">
          <ViewerCanvas />
        </section>

        <aside className="overflow-y-auto border-l border-line bg-panel p-4">
          {selected.data ? (
            <InstanceDetail
              instance={selected.data}
              cls={scan.data?.classes.find((c) => c.id === selected.data.class_id)}
            />
          ) : (
            <p className="text-sm text-muted">Click an object in the 3D view to see its details.</p>
          )}
        </aside>
      </main>

      <footer className="border-t border-line bg-panel px-4 py-1.5 text-xs text-muted">
        Data: NORA dataset, SENAI ISI-SIM, licensed{" "}
        <a className="underline" href="https://creativecommons.org/licenses/by/4.0/">
          CC BY 4.0
        </a>
        , doi:
        <a className="underline" href="https://doi.org/10.5281/zenodo.21775624">
          10.5281/zenodo.21775624
        </a>
        . Object labels are the dataset's human annotations, standing in for AI detections.
      </footer>
    </div>
  );
}
