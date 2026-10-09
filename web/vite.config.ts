import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import sirv from "sirv";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Serves the repo's data/ folder (JSON + Potree tiles) at /data in `vite dev` and
// `vite preview`, with HTTP Range support. data/ is never copied into dist/: the
// static demo build gets its JSON and tiles from elsewhere (T9).
const dataDir = fileURLToPath(new URL("../data", import.meta.url));

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

export default defineConfig({
  plugins: [react(), tailwindcss(), serveData()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
