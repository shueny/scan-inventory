import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import sirv from "sirv";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Serves the repo's data/ folder (JSON + Potree tiles) at /data in `vite dev` and
// `vite preview`, with HTTP Range support. data/ is never copied into dist/: the
// static demo build gets its JSON and tiles from elsewhere (T9). The browser tests set
// SCAN_DATA_DIR to the small committed fixture plant instead (e2e/fixtures/data).
const dataDir = process.env.SCAN_DATA_DIR
  ? fileURLToPath(new URL(process.env.SCAN_DATA_DIR, `file://${process.cwd()}/`))
  : fileURLToPath(new URL("../data", import.meta.url));

function serveData(): Plugin {
  const serve = sirv(dataDir, { dev: true, etag: true });
  return {
    name: "serve-data",
    configureServer(server) {
      server.middlewares.use("/data", serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/data", serve);
    },
  };
}

// In api mode the app calls /api on its own origin, as behind nginx in PRD 6. The dev and
// preview servers pass those calls on to the FastAPI service from `docker compose up`.
const apiProxy = { "/api": { target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000" } };

export default defineConfig({
  plugins: [react(), tailwindcss(), serveData()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // The API contract run needs Docker and is started with `pnpm test:contract`.
    exclude: ["**/node_modules/**", "src/data/contract/apiSource.contract.test.ts", "e2e/**"],
  },
});
