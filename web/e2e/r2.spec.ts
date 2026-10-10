import { expect, test } from "@playwright/test";

// The Pages Function that serves the demo's data from R2 (ADR 0015), checked over HTTP on
// the real Cloudflare runtime. Runs only in the demo-stack run (pnpm test:e2e:demo), where
// /r2/* exists; the fixture plant's octree.bin is in the local bucket.
test.skip(!process.env.E2E_BASE_URL, "only on the demo stack (pnpm test:e2e:demo)");

const OCTREE = "/r2/v1/potree/nora/octree.bin";

test("a byte range gives 206 with Content-Range and exactly those bytes", async ({ request }) => {
  const whole = await request.get(OCTREE);
  expect(whole.status()).toBe(200);
  const all = await whole.body();

  for (const [range, start, end] of [
    ["bytes=0-99", 0, 99],
    ["bytes=1000-1999", 1000, 1999],
    [`bytes=${all.length - 10}-`, all.length - 10, all.length - 1],
    ["bytes=-16", all.length - 16, all.length - 1],
    [`bytes=${all.length - 5}-${all.length + 500}`, all.length - 5, all.length - 1],
  ] as const) {
    const res = await request.get(OCTREE, { headers: { Range: range } });
    expect(res.status(), range).toBe(206);
    expect(res.headers()["content-range"], range).toBe(`bytes ${start}-${end}/${all.length}`);
    const body = await res.body();
    expect(body.length, range).toBe(end - start + 1);
    expect(body.equals(all.subarray(start, end + 1)), range).toBe(true);
  }
});

test("impossible ranges give 416, unsupported ones the whole file", async ({ request }) => {
  const size = Number((await request.head(OCTREE)).headers()["content-length"]);
  for (const range of [`bytes=${size}-`, `bytes=${size + 100}-${size + 200}`, "bytes=50-10"]) {
    const res = await request.get(OCTREE, { headers: { Range: range } });
    expect(res.status(), range).toBe(416);
    expect(res.headers()["content-range"], range).toBe(`bytes */${size}`);
  }
  const several = await request.get(OCTREE, { headers: { Range: "bytes=0-1,5-6" } });
  expect(several.status()).toBe(200);
  expect((await several.body()).length).toBe(size);
});

test("ETag revalidation, unknown keys, other methods", async ({ request }) => {
  const first = await request.get("/r2/v1/data/scan.json");
  expect(first.status()).toBe(200);
  expect(first.headers()["cache-control"]).toBe("private, max-age=86400");
  const etag = first.headers()["etag"] ?? "";
  const again = await request.get("/r2/v1/data/scan.json", { headers: { "If-None-Match": etag } });
  expect(again.status()).toBe(304);

  expect((await request.get("/r2/v1/nope.json")).status()).toBe(404);
  expect((await request.get("/r2/")).status()).toBe(404);
  expect((await request.post("/r2/v1/data/scan.json")).status()).toBe(405);
});
