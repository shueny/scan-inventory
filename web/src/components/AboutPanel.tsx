import { useEffect, useRef } from "react";
import { REPO_URL } from "../config";

/**
 * "About" (PRD 8.7): what the project is, the honest framing, the architecture in one
 * picture, the repository link and the dataset credit. A modal dialog: focus moves into it,
 * Escape or the close button returns.
 */
export function AboutPanel({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-heading"
        className="max-h-full w-full max-w-2xl overflow-auto rounded-lg bg-panel p-6 text-sm shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="about-heading" className="text-lg font-semibold">
            About scan-inventory
          </h2>
          <button
            ref={close}
            type="button"
            onClick={onClose}
            className="rounded border border-line px-2 py-0.5 hover:bg-canvas"
          >
            Close
          </button>
        </div>

        <p className="mt-3">
          A web platform that turns an annotated laser scan of an industrial plant into a reviewable
          object inventory: the scan in 3D, the objects by zone and system linked to the P&amp;ID
          tag list, a review queue of suspicious results, a dashboard and a CSV export.
        </p>
        <p className="mt-2">
          <strong>Honest framing:</strong> the objects are the dataset&apos;s human annotations,
          standing in for AI detections. The review queue comes from rule-based checks against the
          P&amp;ID. No model was trained here.
        </p>

        <h3 className="mt-4 font-semibold">How it is built</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>
            Offline, a Python pipeline reads the 3.25 GB point cloud (151.9M points) in chunks and
            writes the inventory, the issues and Potree tiles.
          </li>
          <li>
            The browser streams the tiles with HTTP Range requests and draws only what the camera
            needs (level of detail), with a point budget.
          </li>
          <li>
            One UI, two data sources: a FastAPI + PostgreSQL backend for local use, and this demo,
            which reads static files and keeps your review changes in the browser. Both pass the
            same contract tests.
          </li>
        </ol>
        <p className="mt-2 text-muted">
          This demo shows a 13 % random sample of the scan (about 20M points).
        </p>

        <h3 className="mt-4 font-semibold">Links</h3>
        <ul className="mt-1 space-y-1">
          <li>
            Source code and documentation:{" "}
            <a className="text-accent underline" href={REPO_URL}>
              {REPO_URL.replace(/^https:\/\//, "")}
            </a>
          </li>
          <li>
            Data: NORA dataset, SENAI ISI-SIM,{" "}
            <a className="underline" href="https://creativecommons.org/licenses/by/4.0/">
              CC BY 4.0
            </a>
            ,{" "}
            <a className="underline" href="https://doi.org/10.5281/zenodo.21775624">
              doi:10.5281/zenodo.21775624
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
