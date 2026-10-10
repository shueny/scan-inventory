import { useState, type ReactNode } from "react";
import { DEMO_VIDEO_URL } from "../config";

export const MIN_WIDTH_PX = 1024;

/** True when the browser can create a WebGL 2 context (the point cloud needs it). */
export function hasWebGL2(): boolean {
  try {
    return document.createElement("canvas").getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

/**
 * Before the app (PRD 8.7): without WebGL 2 there is no 3D view, so explain that and show a
 * screenshot (and the video, when there is one) instead of a blank page. Below 1024 px wide
 * the app is cramped (desktop only, PRD 4): say so, and let the visitor continue anyway.
 */
export function ScreenGate({
  children,
  webgl2 = hasWebGL2(),
  width = window.innerWidth,
}: {
  children: ReactNode;
  webgl2?: boolean;
  width?: number;
}) {
  const [continueSmall, setContinueSmall] = useState(false);

  if (!webgl2) {
    return (
      <Notice title="This browser cannot show the 3D scan">
        <p>
          The point cloud needs WebGL 2, which this browser or device does not offer (or has turned
          off). A current Chrome, Firefox, Edge or Safari on a desktop computer works.
        </p>
        <img
          src="/demo-screenshot.jpg"
          alt="The app: filters on the left, the scan in 3D with the inventory table below it, and an object's details on the right."
          className="mt-3 w-full rounded border border-line"
        />
        <VideoLink />
      </Notice>
    );
  }

  if (width < MIN_WIDTH_PX && !continueSmall) {
    return (
      <Notice title="Made for a desktop screen">
        <p>
          This demo has three columns (filters, 3D view, details) and needs a window at least{" "}
          {MIN_WIDTH_PX} px wide.
        </p>
        <VideoLink />
        <button
          type="button"
          onClick={() => setContinueSmall(true)}
          className="mt-3 rounded-md bg-ink px-3 py-1.5 text-white"
        >
          Continue anyway
        </button>
      </Notice>
    );
  }

  return <>{children}</>;
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-2 p-6 text-sm">
      <h1 className="text-lg font-semibold">scan-inventory</h1>
      <h2 className="font-semibold">{title}</h2>
      {children}
    </main>
  );
}

function VideoLink() {
  if (!DEMO_VIDEO_URL) return null;
  return (
    <p className="mt-2">
      <a className="text-accent underline" href={DEMO_VIDEO_URL}>
        Watch the 90-second demo video
      </a>
    </p>
  );
}
