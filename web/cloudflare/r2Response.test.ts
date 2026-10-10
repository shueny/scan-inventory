// @vitest-environment node
import {
  keyFromPath,
  notSatisfiable,
  r2Response,
  rangeRequest,
  returnedRange,
  type R2Like,
} from "./r2Response";

const SIZE = 1000;

function object(fields: Partial<R2Like> = {}): R2Like {
  return {
    size: SIZE,
    httpEtag: '"abc"',
    body: new Response("x").body,
    writeHttpMetadata: (h) => h.set("Content-Type", "application/octet-stream"),
    ...fields,
  };
}

describe("rangeRequest", () => {
  it("turns closed, open and suffix ranges into R2 options", () => {
    expect(rangeRequest("bytes=0-99")).toEqual({ offset: 0, length: 100 });
    expect(rangeRequest("bytes=900-")).toEqual({ offset: 900 });
    expect(rangeRequest("bytes=0-")).toEqual({ offset: 0 }); // still a range: 206
    expect(rangeRequest("bytes=-100")).toEqual({ suffix: 100 });
    expect(rangeRequest("Bytes = 10-19")).toEqual({ offset: 10, length: 10 });
  });

  it("says when a range can never be satisfied", () => {
    expect(rangeRequest("bytes=50-10")).toBe("invalid");
    expect(rangeRequest("bytes=-0")).toBe("invalid");
  });

  it("ignores what it does not support (whole object instead)", () => {
    expect(rangeRequest(null)).toBeNull();
    expect(rangeRequest("bytes=0-1,5-6")).toBeNull();
    expect(rangeRequest("items=0-1")).toBeNull();
    expect(rangeRequest("bytes=-")).toBeNull();
  });
});

describe("returnedRange", () => {
  it("reads what R2 returned, clamped to the object", () => {
    expect(returnedRange(object({ range: { offset: 100, length: 100 } }))).toEqual({
      start: 100,
      end: 199,
    });
    expect(returnedRange(object({ range: { offset: 900 } }))).toEqual({ start: 900, end: 999 });
    expect(returnedRange(object({ range: { suffix: 100 } }))).toEqual({ start: 900, end: 999 });
    expect(returnedRange(object({ range: { suffix: 5000 } }))).toEqual({ start: 0, end: 999 });
    expect(returnedRange(object({ range: { offset: 990, length: 100 } }))).toEqual({
      start: 990,
      end: 999,
    });
  });
});

describe("r2Response", () => {
  const cache = "private, max-age=86400";
  const get = (ranged: boolean) => ({ method: "GET", ranged });

  it("answers a range with 206 and Content-Range from what R2 returned", () => {
    const res = r2Response(object({ range: { offset: 100, length: 100 } }), get(true), cache);

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 100-199/1000");
    expect(res.headers.get("Content-Length")).toBe("100");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("ETag")).toBe('"abc"');
    expect(res.headers.get("Cache-Control")).toBe(cache);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("answers bytes=0- with 206 even if R2 reports no range", () => {
    const res = r2Response(object({ range: undefined }), get(true), cache);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-999/1000");
  });

  it("answers 416 when nothing is left after the start", () => {
    const res = r2Response(object({ range: { offset: 1000 } }), get(true), cache);
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */1000");
  });

  it("answers 200 with the whole object without a range", () => {
    const res = r2Response(object(), get(false), cache);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("1000");
    expect(res.headers.has("Content-Range")).toBe(false);
  });

  it("answers 304 when R2 returned no body, 404 when the object is missing", () => {
    expect(r2Response(object({ body: undefined }), get(false), cache).status).toBe(304);
    expect(r2Response(null, get(false), cache).status).toBe(404);
  });

  it("answers HEAD with the headers and no body", async () => {
    const res = r2Response(object(), { method: "HEAD", ranged: false }, cache);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("1000");
    expect(await res.text()).toBe("");
  });
});

describe("notSatisfiable and keyFromPath", () => {
  it("gives 416 with the size when known", () => {
    expect(notSatisfiable(1000).headers.get("Content-Range")).toBe("bytes */1000");
    expect(notSatisfiable(null).headers.has("Content-Range")).toBe(false);
  });

  it("joins the path below the mount point and refuses anything else", () => {
    expect(keyFromPath(["v1", "potree", "nora", "octree.bin"])).toBe("v1/potree/nora/octree.bin");
    expect(keyFromPath([])).toBeNull();
    expect(keyFromPath([undefined])).toBeNull();
    expect(keyFromPath(["v1", "..", "secret"])).toBeNull();
    expect(keyFromPath(["v1", "", "x"])).toBeNull();
    expect(keyFromPath(["v1\\x"])).toBeNull();
  });
});
