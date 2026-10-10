import { useEffect, useRef } from "react";
import { IS_DEMO, REPO_URL } from "../config";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * "About" (PRD 8.7): what the project is, the honest framing, the architecture in one
 * picture, the repository link and the dataset credit. A modal dialog: focus moves in and
 * stays in (Tab cycles), Escape or Close returns focus to where it was.
 */
export function AboutPanel({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // On the document, not the dialog: Tab and Escape work wherever focus is (review round 2:
  // after a click on the backdrop, focus could leave the dialog and Escape stopped working).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const inside = dialog.current.contains(document.activeElement);
      if (!inside || (e.shiftKey && document.activeElement === first)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4"
      // A click on the dimmed backdrop keeps focus where it is (inside the dialog).
      onMouseDown={(e) => e.target === e.currentTarget && e.preventDefault()}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-heading"
        tabIndex={-1}
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
        <ArchitectureDiagram />
        <p className="mt-2 text-muted">
          {IS_DEMO
            ? "This demo reads static files and keeps your review changes in this browser; it shows a 13 % random sample of the scan (about 20M points)."
            : "Local full mode: review changes are stored by the FastAPI service in PostgreSQL; the scan is shown in full (151.9M points)."}{" "}
          Both modes use the same interface and pass the same contract tests.
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

/** The architecture in one picture: offline pipeline, served data, the browser. */
function ArchitectureDiagram() {
  const box = (x: number, title: string, lines: string[]) => (
    <g>
      <rect
        x={x}
        y={8}
        width={170}
        height={84}
        rx={6}
        fill="var(--color-canvas)"
        stroke="var(--color-line)"
      />
      <text x={x + 10} y={30} fontSize={12} fontWeight={600} fill="var(--color-ink)">
        {title}
      </text>
      {lines.map((l, i) => (
        <text key={l} x={x + 10} y={50 + i * 16} fontSize={11} fill="var(--color-muted)">
          {l}
        </text>
      ))}
    </g>
  );
  const arrow = (x: number) => (
    <path d={`M ${x} 50 h 24 m -6 -5 l 6 5 l -6 5`} fill="none" stroke="var(--color-muted)" />
  );
  return (
    <svg
      viewBox="0 0 590 100"
      role="img"
      aria-label="Offline, a Python pipeline turns the 3.25 GB scan into the inventory, the issues and Potree tiles. These are served as static files (and, locally, by an API with PostgreSQL). The browser streams the tiles with Range requests and draws them with Three.js."
      className="mt-2 w-full"
    >
      {box(0, "Offline pipeline", [
        "nora.ply, 151.9M points",
        "inventory, issues (JSON)",
        "Potree tiles",
      ])}
      {arrow(176)}
      {box(206, "Served", [
        "tiles + JSON (static)",
        IS_DEMO ? "Cloudflare R2, Access" : "nginx + FastAPI",
        IS_DEMO ? "review: in this browser" : "review: PostgreSQL",
      ])}
      {arrow(382)}
      {box(412, "Browser", ["Range requests, LOD", "Three.js + Potree loader", "React panels"])}
    </svg>
  );
}
