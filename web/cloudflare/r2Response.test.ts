// @vitest-environment node
import { keyFromPath, parseRange, r2Response, type R2Like } from "./r2Response";

const SIZE = 1000;

function object(fields: Partial<R2Like> = {}): R2Like {
  return {
    size: SIZE,
    httpEtag: '"abc"',
    body: new Response("x".repeat(SIZE)).body,
    writeHttpMetadata: (h) => h.set("Content-Type", "application/octet-stream"),
    ...fields,
  };
}

const get = (rangeHeader: string | null) => ({ method: "GET", rangeHeader });

describe("parseRange", () => {
  it("reads a closed, an open and a suffix range, clamped to the object", () => {
    expect(parseRange("bytes=0-99", SIZE)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=900-", SIZE)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=0-", SIZE)).toEqual({ start: 0, end: 999 }); // still a range
    expect(parseRange("bytes=-100", SIZE)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-5000", SIZE)).toEqual({ start: 0, end: 999 });
    expect(parseRange("bytes=990-2000", SIZE)).toEqual({ start: 990, end: 999 });
  });

  it("says when a range cannot be satisfied", () => {
    expect(parseRange("bytes=1000-1001", SIZE)).toBe("invalid");
    expect(parseRange("bytes=50-10", SIZE)).toBe("invalid");
    expect(parseRange("bytes=-0", SIZE)).toBe("invalid");
  });

  it("ignores what it does not support (whole object instead)", () => {
    expect(parseRange(null, SIZE)).toBeNull();
    expect(parseRange("bytes=0-1,5-6", SIZE)).toBeNull();
    expect(parseRange("items=0-1", SIZE)).toBeNull();
    expect(parseRange("bytes=-", SIZE)).toBeNull();
  });
});

describe("r2Response", () => {
  const cache = "private, max-age=86400";

  it("answers a Range request with 206, Content-Range and the slice length", () => {
    const res = r2Response(object(), get("bytes=100-199"), cache);

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 100-199/1000");
    expect(res.headers.get("Content-Length")).toBe("100");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("ETag")).toBe('"abc"');
    expect(res.headers.get("Cache-Control")).toBe(cache);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("answers bytes=0- with 206 too (R2 may treat it as a full read)", () => {
    const res = r2Response(object({ range: undefined }), get("bytes=0-"), cache);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-999/1000");
  });

  it("answers 200 with the whole object without a Range header", () => {
    const res = r2Response(object(), get(null), cache);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("1000");
    expect(res.headers.has("Content-Range")).toBe(false);
  });

  it("answers 416 with the size for a range past the end", () => {
    const res = r2Response(object(), get("bytes=5000-"), cache);
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */1000");
  });

  it("answers 304 when R2 returned no body (If-None-Match matched), 404 when missing", () => {
    expect(r2Response(object({ body: undefined }), get(null), cache).status).toBe(304);
    expect(r2Response(null, get(null), cache).status).toBe(404);
  });

  it("answers HEAD with the headers and no body", async () => {
    const res = r2Response(object(), { method: "HEAD", rangeHeader: null }, cache);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("1000");
    expect(await res.text()).toBe("");
  });
});

describe("keyFromPath", () => {
  it("joins the path below the mount point", () => {
    expect(keyFromPath(["v1", "potree", "nora", "octree.bin"])).toBe("v1/potree/nora/octree.bin");
  });

  it("refuses anything that could leave the prefix or is empty", () => {
    expect(keyFromPath([])).toBeNull();
    expect(keyFromPath(["v1", "..", "secret"])).toBeNull();
    expect(keyFromPath(["v1", "", "x"])).toBeNull();
    expect(keyFromPath(["v1\\x"])).toBeNull();
  });
});
