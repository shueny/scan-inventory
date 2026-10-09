import { Dashboard } from "./components/Dashboard";
import { FilterPanel } from "./components/FilterPanel";
import { InstanceDetail } from "./components/InstanceDetail";
import { InventoryTable } from "./components/InventoryTable";
import { ReviewQueue } from "./components/ReviewQueue";
import { panelId, tabId, Tabs } from "./components/Tabs";
import { useInstance, useInstances, useIssues, useScan } from "./data/hooks";
import { isOpen } from "./domain/issues";
import { useViewStore } from "./state/viewStore";
import { ViewerCanvas } from "./viewer/ViewerCanvas";

/** Three columns: filters, 3D above the inventory table, details (PRD 8.4, 8.6). */
export function App() {
  const scan = useScan();
  const instances = useInstances();
  const issues = useIssues();
  const bottomTab = useViewStore((s) => s.bottomTab);
  const setBottomTab = useViewStore((s) => s.setBottomTab);
  const openCount = issues.data?.filter(isOpen).length;
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
          {scan.data && instances.data && (
            <FilterPanel
              classes={scan.data.classes}
              zones={scan.data.zones}
              instances={instances.data}
            />
          )}
          {(scan.isError || instances.isError) && (
            <p className="text-sm text-red-700">Could not load the scan data.</p>
          )}
        </aside>

        <div className="grid min-h-0 grid-rows-[3fr_2fr]">
          <section aria-label="3D view" className="min-h-0">
            <ViewerCanvas />
          </section>
          <section
            aria-label="Inventory and review"
            className="flex min-h-0 flex-col border-t border-line bg-panel"
          >
            <div className="border-b border-line">
              <Tabs
                group="lists"
                label="Lists"
                variant="underline"
                items={[
                  { value: "inventory", label: "Inventory" },
                  {
                    value: "queue",
                    label: `Review queue${openCount !== undefined ? ` (${openCount})` : ""}`,
                  },
                  { value: "dashboard", label: "Dashboard" },
                ]}
                selected={bottomTab}
                onSelect={setBottomTab}
              />
            </div>
            <div
              role="tabpanel"
              id={panelId("lists", bottomTab)}
              aria-labelledby={tabId("lists", bottomTab)}
              className="min-h-0 flex-1"
            >
              {bottomTab === "inventory" && scan.data && instances.data && (
                <InventoryTable instances={instances.data} classes={scan.data.classes} />
              )}
              {bottomTab === "queue" && scan.data && instances.data && issues.data && (
                <ReviewQueue
                  issues={issues.data}
                  instances={instances.data}
                  classes={scan.data.classes}
                />
              )}
              {bottomTab === "dashboard" && scan.data && instances.data && (
                <Dashboard
                  instances={instances.data}
                  issues={issues.data}
                  classes={scan.data.classes}
                  zones={scan.data.zones}
                />
              )}
              {!instances.data && !instances.isError && (
                <p className="p-4 text-sm text-muted">Loading the inventory…</p>
              )}
              {issues.isError && bottomTab === "queue" && (
                <p className="p-4 text-sm text-red-700">Could not load the review queue.</p>
              )}
            </div>
          </section>
        </div>

        <aside className="overflow-y-auto border-l border-line bg-panel p-4">
          {selected.data && scan.data ? (
            <InstanceDetail instance={selected.data} classes={scan.data.classes} />
          ) : (
            <p className="text-sm text-muted">
              Click an object in the 3D view or a row in the table to see its details.
            </p>
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
