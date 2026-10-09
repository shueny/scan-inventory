// Build-time settings (Vite env variables, see .env.example).

export const DATA_MODE = import.meta.env.VITE_DATA_MODE ?? "static";
export const DATA_BASE_URL = import.meta.env.VITE_DATA_BASE_URL ?? "/data";
// The FastAPI service (api mode): same origin, the dev server proxies /api (vite.config.ts).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
export const TILES_BASE_URL = import.meta.env.VITE_TILES_BASE_URL ?? "/data/potree/nora";
export const SCAN_ID = "nora";

// Maximum points drawn at once; the loader picks the most useful octree nodes up to this.
export const POINT_BUDGET = 3_000_000;
