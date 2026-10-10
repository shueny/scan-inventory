// @vitest-environment node
import { handleR2Request, type BucketLike } from "./r2Handler";
import type { R2Like } from "./r2Response";

const meta = (): R2Like => ({ size: 1000, httpEtag: '"e"', writeHttpMetadata: () => {} });
const withBody = (range?: R2Like["range"]): R2Like => ({
  ...meta(),
  range,
  body: new Response("x").body,
});

function bucket(get: BucketLike["get"]): BucketLike {
  return { head: () => Promise.resolve(meta()), get };
}
const req = (headers: Record<string, string> = {}, method = "GET") =>
  new Request("https://demo/r2/v1/potree/nora/octree.bin", { method, headers });
const path = ["v1", "potree", "nora", "octree.bin"];

describe("handleR2Request", () => {
  it("asks R2 for the explicit range and answers 206", async () => {
    let asked: unknown;
    const b = bucket((_key, options) => {
      asked = options.range;
      return Promise.resolve(withBody({ offset: 100, length: 10 }));
    });

    const res = await handleR2Request(req({ Range: "bytes=100-109" }), path, b);

    expect(asked).toEqual({ offset: 100, length: 10 });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 100-109/1000");
  });

  it("answers 416 when R2 refuses a range that starts past the end", async () => {
    const b = bucket(() => Promise.reject(new Error("range not satisfiable")));
    const res = await handleR2Request(req({ Range: "bytes=5000-" }), path, b);
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */1000");
  });

  it("does not hide other R2 failures behind a 416", async () => {
    const b = bucket(() => Promise.reject(new Error("boom")));
    await expect(handleR2Request(req({ Range: "bytes=0-9" }), path, b)).rejects.toThrow(
      "R2 read failed",
    );
    await expect(handleR2Request(req(), path, b)).rejects.toThrow("R2 read failed");
  });

  it("passes only If-None-Match on, refuses other methods and bad paths", async () => {
    let onlyIf: Headers | undefined;
    const b = bucket((_key, options) => {
      onlyIf = options.onlyIf;
      return Promise.resolve(meta()); // no body: not modified
    });

    const res = await handleR2Request(req({ "If-None-Match": '"e"', "If-Match": '"x"' }), path, b);

    expect(res.status).toBe(304);
    expect(onlyIf?.get("If-None-Match")).toBe('"e"');
    expect(onlyIf?.has("If-Match")).toBe(false);
    expect((await handleR2Request(req({}, "POST"), path, b)).status).toBe(405);
    const missing: BucketLike = {
      head: () => Promise.resolve(null),
      get: () => Promise.resolve(null),
    };
    expect((await handleR2Request(req({ Range: "bytes=50-10" }), path, missing)).status).toBe(404);
    expect((await handleR2Request(req(), ["v1", ".."], b)).status).toBe(404);
  });
});
