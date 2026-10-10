import { useEffect, useMemo, useRef, useState } from "react";
import { POINT_BUDGET, TILES_BASE_URL } from "../config";
import { useInstances, useScan } from "../data/hooks";
import { filterInstances, isFiltering } from "../domain/filters";
import { useViewStore } from "../state/viewStore";
import { Viewer, type ViewerStats } from "./Viewer";

type LoadState = "loading" | "ready" | "error";

/** Mounts the Three.js viewer and keeps it in sync with the shared store. */
export function ViewerCanvas() {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [stats, setStats] = useState<ViewerStats | null>(null);
  // Latched: once points were drawn, the loading screen never comes back (e.g. when the
  // camera looks at empty space and nothing is in view).
  const [firstPoints, setFirstPoints] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const showStats = new URLSearchParams(location.search).has("stats");

  const scan = useScan();
  const instances = useInstances();
  const selectedId = useViewStore((s) => s.selectedId);
  const colorMode = useViewStore((s) => s.colorMode);
  const backgroundVisible = useViewStore((s) => s.backgroundVisible);
  const select = useViewStore((s) => s.select);
  const filters = useViewStore((s) => s.filters);
  const filtered = useMemo(
    () =>
      instances.data && isFiltering(filters)
        ? filterInstances(instances.data, { ...filters, includeBackground: false })
        : null,
    [instances.data, filters],
  );

  // Create once per mount; dispose on unmount (StrictMode mounts twice in dev).
  useEffect(() => {
    if (!container.current) return;
    const v = new Viewer(container.current, {
      tilesBaseUrl: TILES_BASE_URL,
      pointBudget: POINT_BUDGET,
      onPick: (id) => useViewStore.getState().select(id),
      onStats: (s) => {
        setStats(s);
        if (s.visiblePoints > 0) setFirstPoints(true);
      },
    });
    viewer.current = v;
    // Browser tests (Playwright, `?e2e`) read the camera projection and the pick method.
    if (new URLSearchParams(location.search).has("e2e")) {
      (window as unknown as { __scanViewer?: Viewer }).__scanViewer = v;
    }
    // Only the viewer still mounted reports its state (StrictMode creates one and
    // throws it away first; its load must not mark the second one as ready).
    v.load().then(
      () => viewer.current === v && setLoadState("ready"),
      () => viewer.current === v && setLoadState("error"),
    );
    return () => {
      v.dispose();
      viewer.current = null;
      const w = window as unknown as { __scanViewer?: Viewer };
      if (w.__scanViewer === v) delete w.__scanViewer;
    };
  }, []);

  useEffect(() => {
    if (loadState === "ready" && scan.data) viewer.current?.setClasses(scan.data.classes);
  }, [loadState, scan.data]);

  useEffect(() => {
    if (instances.data) viewer.current?.setInstances(instances.data);
  }, [instances.data]);

  useEffect(() => {
    viewer.current?.setFilterBoxes(filtered);
  }, [filtered]);

  useEffect(() => {
    viewer.current?.setColorMode(colorMode);
  }, [colorMode]);

  useEffect(() => {
    viewer.current?.setBackgroundVisible(backgroundVisible);
  }, [backgroundVisible]);

  useEffect(() => {
    if (loadState !== "ready") return;
    const instance = instances.data?.find((i) => i.instance_id === selectedId) ?? null;
    viewer.current?.select(instance);
  }, [loadState, selectedId, instances.data]);

  // Seconds since the viewer started loading (one clock for both steps, review round 2);
  // stops once points are drawn or loading failed.
  const [loadStart] = useState(() => Date.now());
  const loadingDone = firstPoints || loadState === "error";
  useEffect(() => {
    if (loadingDone) return;
    const timer = setInterval(
      () => setLoadingSeconds(Math.round((Date.now() - loadStart) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [loadingDone, loadStart]);

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="absolute inset-0" data-testid="viewer" />

      {/* Loading screen with progress (PRD 8.7): until the first points are drawn. Only the
          step is announced to screen readers; the seconds counter is visual only. */}
      {!loadingDone && (
        <Overlay>
          <span role="status">
            Loading the scan… step{" "}
            {loadState === "loading" ? "1 of 2: tile index" : "2 of 2: first points"}
          </span>
          {loadingSeconds > 0 && <span aria-hidden> ({loadingSeconds} s)</span>}
          {loadingSeconds >= 20 && (
            <span role="status" className="mt-2 block">
              This is taking longer than usual: the connection may be slow, or the data could not be
              read.{" "}
              <button
                type="button"
                onClick={() => location.reload()}
                className="pointer-events-auto underline"
              >
                Reload
              </button>
            </span>
          )}
        </Overlay>
      )}
      {loadState === "error" && (
        <Overlay>
          The point cloud could not be loaded. Check that the tiles exist at{" "}
          <code className="font-mono">{TILES_BASE_URL}</code>.
        </Overlay>
      )}

      <div className="absolute top-3 right-3 flex gap-2">
        <button
          type="button"
          onClick={() => viewer.current?.frameAll()}
          className="rounded-md border border-line bg-panel/90 px-2.5 py-1 text-xs shadow-sm hover:bg-panel"
        >
          Frame all
        </button>
        {selectedId !== null && (
          <button
            type="button"
            onClick={() => select(null)}
            className="rounded-md border border-line bg-panel/90 px-2.5 py-1 text-xs shadow-sm hover:bg-panel"
          >
            Clear selection
          </button>
        )}
      </div>

      {showStats && stats && (
        <div className="absolute bottom-2 right-3 rounded bg-panel/80 px-2 py-0.5 font-mono text-[11px] text-muted">
          {stats.fps} fps · {stats.visiblePoints.toLocaleString()} points
        </div>
      )}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <p className="max-w-sm rounded-md bg-panel/90 px-4 py-3 text-sm text-muted shadow-sm">
        {children}
      </p>
    </div>
  );
}
