// Build-time settings (Vite env variables, see .env.example).

export const DATA_MODE = import.meta.env.VITE_DATA_MODE ?? "static";
export const DATA_BASE_URL = import.meta.env.VITE_DATA_BASE_URL ?? "/data";
// The FastAPI service (api mode): same origin, the dev server proxies /api (vite.config.ts).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
export const TILES_BASE_URL = import.meta.env.VITE_TILES_BASE_URL ?? "/data/potree/nora";
export const SCAN_ID = "nora";
// Version of the static data: review changes kept in the browser belong to one version,
// so a new data upload starts with a clean review state (PRD 8.7).
export const DATA_VERSION = import.meta.env.VITE_DATA_VERSION || "v1";
export const REPO_URL = import.meta.env.VITE_REPO_URL || "https://github.com/shueny/scan-inventory";
export const DEMO_VIDEO_URL = import.meta.env.VITE_DEMO_VIDEO_URL || null;
/** Static mode is the public demo: review changes live in this browser only. */
export const IS_DEMO = DATA_MODE !== "api";

// Maximum points drawn at once; the loader picks the most useful octree nodes up to this.
export const POINT_BUDGET = 3_000_000;
