import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  const [failed, setFailed] = useState(false);
  const persistent = source.isPersistent?.(SCAN_ID) ?? true;
  const resetButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // Keep keyboard focus on the visible control when the confirmation opens or closes.
  useEffect(() => {
    if (confirming) cancelButton.current?.focus();
    else if (wasConfirming.current) resetButton.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const reset = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await source.resetDemo?.();
      useViewStore.setState({ selectedId: null, selectedIssueId: null });
      await client.invalidateQueries();
      setConfirming(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
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
            <span aria-live="polite">Forget all your review changes?</span>
            <button
              type="button"
              onClick={() => void reset()}
              disabled={busy}
              className="rounded border border-amber-400 bg-white px-2 py-0.5 hover:bg-amber-100 disabled:opacity-50"
            >
              Yes, reset
            </button>
            <button
              ref={cancelButton}
              type="button"
              onClick={() => {
                setConfirming(false);
                setFailed(false);
              }}
              className="rounded px-2 py-0.5 underline"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            ref={resetButton}
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded border border-amber-300 bg-white px-2 py-0.5 hover:bg-amber-100"
          >
            Reset demo
          </button>
        ))}
      {failed && (
        <p role="alert" className="text-red-700">
          The reset did not work. Reload the page and try again.
        </p>
      )}
    </div>
  );
}
