import { useEffect, useRef, useState } from "react";
import { POINT_BUDGET, TILES_BASE_URL } from "../config";
import { useInstances, useScan } from "../data/hooks";
import { useViewStore } from "../state/viewStore";
import { Viewer, type ViewerStats } from "./Viewer";

type LoadState = "loading" | "ready" | "error";

/** Mounts the Three.js viewer and keeps it in sync with the shared store. */
export function ViewerCanvas() {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [stats, setStats] = useState<ViewerStats | null>(null);
  const showStats = new URLSearchParams(location.search).has("stats");

  const scan = useScan();
  const instances = useInstances();
  const selectedId = useViewStore((s) => s.selectedId);
  const colorMode = useViewStore((s) => s.colorMode);
  const backgroundVisible = useViewStore((s) => s.backgroundVisible);
  const select = useViewStore((s) => s.select);

  // Create once per mount; dispose on unmount (StrictMode mounts twice in dev).
  useEffect(() => {
    if (!container.current) return;
    const v = new Viewer(container.current, {
      tilesBaseUrl: TILES_BASE_URL,
      pointBudget: POINT_BUDGET,
      onPick: (id) => useViewStore.getState().select(id),
      onStats: setStats,
    });
    viewer.current = v;
    v.load().then(
      () => setLoadState("ready"),
      () => setLoadState("error"),
    );
    return () => {
      v.dispose();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    if (loadState === "ready" && scan.data) viewer.current?.setClasses(scan.data.classes);
  }, [loadState, scan.data]);

  useEffect(() => {
    if (instances.data) viewer.current?.setInstances(instances.data);
  }, [instances.data]);

  useEffect(() => {
    if (loadState === "ready") viewer.current?.setColorMode(colorMode);
  }, [loadState, colorMode]);

  useEffect(() => {
    viewer.current?.setBackgroundVisible(backgroundVisible);
  }, [backgroundVisible]);

  useEffect(() => {
    if (loadState !== "ready") return;
    const instance = instances.data?.find((i) => i.instance_id === selectedId) ?? null;
    viewer.current?.select(instance);
  }, [loadState, selectedId, instances.data]);

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="absolute inset-0" data-testid="viewer" />

      {loadState === "loading" && <Overlay>Loading the scan…</Overlay>}
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
