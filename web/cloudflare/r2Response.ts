/**
 * Turn an R2 object into an HTTP response for the public demo (ADR 0015).
 *
 * The demo's tiles and JSON live in a private R2 bucket and are served by a Pages Function
 * on the same, Access-protected site. The Potree loader reads `octree.bin` and
 * `hierarchy.bin` with Range requests and needs `206 Partial Content` with a correct
 * `Content-Range`; R2's own example does not build that, so this module does. It only
 * uses the small part of the R2 binding API that it needs (below), so it can be unit
 * tested without the Workers runtime.
 */

/** The parts of an R2 object this module reads (`R2Object` / `R2ObjectBody`). */
export interface R2Like {
  size: number;
  httpEtag: string;
  /** The byte range R2 returned, when the request had a Range header. */
  range?: { offset?: number; length?: number; suffix?: number };
  /** Present when the object was read (no `body`: a precondition such as If-None-Match held). */
  body?: ReadableStream | null;
  writeHttpMetadata(headers: Headers): void;
}

export interface ByteRange {
  start: number;
  /** Inclusive. */
  end: number;
}

/**
 * The byte range a `Range` header asks for, clamped to the object, or "invalid" when it
 * cannot be satisfied (RFC 9110: 416). Only single ranges are supported; the loader never
 * asks for more. `null` means no usable range: send the whole object.
 */
export function parseRange(header: string | null, size: number): ByteRange | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null; // other units or several ranges: ignore and send everything
  const [, a = "", b = ""] = m;
  if (a === "" && b === "") return null;
  if (a === "") {
    // suffix: the last N bytes
    const n = Number(b);
    if (n === 0) return "invalid";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  if (start >= size) return "invalid";
  const end = b === "" ? size - 1 : Math.min(Number(b), size - 1);
  if (end < start) return "invalid";
  return { start, end };
}

/** Headers that every answer carries. */
function baseHeaders(object: R2Like, cacheControl: string): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", cacheControl);
  return headers;
}

/**
 * The response for a GET or HEAD of `object`, given the request's Range header.
 * - no object: 404
 * - no body after a conditional read (If-None-Match matched): 304
 * - a Range header: 206 with Content-Range (416 if it cannot be satisfied)
 * - otherwise: 200 with the whole object
 */
export function r2Response(
  object: R2Like | null,
  request: { method: string; rangeHeader: string | null },
  cacheControl: string,
): Response {
  if (!object) return new Response("Not found", { status: 404 });
  const headers = baseHeaders(object, cacheControl);
  const head = request.method === "HEAD";

  if (!head && !object.body) return new Response(null, { status: 304, headers });

  const range = parseRange(request.rangeHeader, object.size);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${object.size}`);
    return new Response(null, { status: 416, headers });
  }
  if (range) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${object.size}`);
    headers.set("Content-Length", String(range.end - range.start + 1));
    return new Response(head ? null : (object.body ?? null), { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(head ? null : (object.body ?? null), { status: 200, headers });
}

/**
 * The R2 key for a request path under the function's mount point, or null for anything
 * that tries to leave it ("..", empty segments). `/r2/v1/potree/nora/octree.bin` ->
 * `v1/potree/nora/octree.bin`.
 */
export function keyFromPath(segments: readonly string[]): string | null {
  if (segments.length === 0) return null;
  for (const s of segments) {
    if (s === "" || s === "." || s === ".." || s.includes("\\")) return null;
  }
  return segments.join("/");
}
