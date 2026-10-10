import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SCAN_ID } from "../config";
import { useDataSource } from "../data/DataSourceProvider";
import { useViewStore } from "../state/viewStore";

/**
 * Public demo mode (PRD 8.7): says where review changes go, and offers "Reset demo",
 * which asks for confirmation before it forgets every change made in this browser.
 */
export function DemoBanner() {
  const source = useDataSource();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const persistent = source.isPersistent?.(SCAN_ID) ?? true;

  const reset = async () => {
    setBusy(true);
    await source.resetDemo?.();
    useViewStore.setState({ selectedId: null, selectedIssueId: null });
    await client.invalidateQueries();
    setBusy(false);
    setConfirming(false);
  };

  return (
    <div
      role="region"
      aria-label="Demo mode"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-sm text-amber-950"
    >
      <p>
        <strong className="font-semibold">Demo mode:</strong>{" "}
        {persistent
          ? "your review changes are saved only in this browser."
          : "browser storage is blocked, so your review changes last only until you close this page."}
      </p>
      {source.resetDemo &&
        (confirming ? (
          <span className="flex items-center gap-2" role="group" aria-label="Confirm reset">
            <span>Forget all your review changes?</span>
            <button
              type="button"
              onClick={() => void reset()}
              disabled={busy}
              className="rounded border border-amber-400 bg-white px-2 py-0.5 hover:bg-amber-100 disabled:opacity-50"
            >
              Yes, reset
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded px-2 py-0.5 underline"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded border border-amber-300 bg-white px-2 py-0.5 hover:bg-amber-100"
          >
            Reset demo
          </button>
        ))}
    </div>
  );
}
