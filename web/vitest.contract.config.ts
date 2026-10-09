import { defineConfig } from "vitest/config";

// `pnpm test:contract`: the shared data source contract against the real API (ADR 0010).
// Starting the API and its database takes a few seconds, so it is not part of `pnpm test`.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/data/contract/apiSource.contract.test.ts"],
    hookTimeout: 180_000,
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
