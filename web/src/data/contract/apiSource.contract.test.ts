// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ApiDataSource } from "../ApiDataSource";
import { contractSuite } from "./suite";

// The real API on a throwaway Postgres seeded with the same fixtures
// (api/tests/contract_server.py). Needs Docker, like the API's own tests.
// Run with `pnpm test:contract`.

const API_DIR = join(process.cwd(), "..", "api"); // tests run from web/
let server: ChildProcess | undefined;
let baseUrl = "";

beforeAll(async () => {
  server = spawn("uv", ["run", "python", "-m", "tests.contract_server"], {
    cwd: API_DIR,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const proc = server;
  baseUrl = await new Promise<string>((resolve, reject) => {
    proc.once("exit", (code) => reject(new Error(`contract server exited with ${code}`)));
    if (!proc.stdout) return reject(new Error("no stdout"));
    createInterface({ input: proc.stdout }).on("line", (line) => {
      if (line.startsWith("READY ")) resolve(line.slice("READY ".length));
    });
  });
});

afterAll(async () => {
  const proc = server;
  if (!proc || proc.exitCode !== null) return;
  const exited = new Promise((resolve) => proc.once("exit", resolve));
  proc.kill("SIGTERM");
  await exited; // the server removes its database container on the way out
});

contractSuite("ApiDataSource", async () => {
  const res = await fetch(`${baseUrl.replace(/\/api$/, "")}/__test__/reset`, { method: "POST" });
  if (res.status !== 204) throw new Error(`reset failed: HTTP ${res.status}`);
  return new ApiDataSource(baseUrl);
});
