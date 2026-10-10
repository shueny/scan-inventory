/**
 * Turn an R2 object into an HTTP response for the public demo (ADR 0015).
 *
 * The demo's tiles and JSON live in a private R2 bucket and are served by a Pages Function
 * on the same, Access-protected site. The Potree loader reads `octree.bin` and
 * `hierarchy.bin` with Range requests and needs `206 Partial Content` with a correct
 * `Content-Range`. The function turns the Range header into an explicit range for R2
 * (`rangeRequest`), and the response headers are built from the range R2 says it returned
 * (`r2Response`), so headers and body always agree (review round 1 of T9). This module
 * only uses the small part of the R2 API it needs, so it is unit tested without the
 * Workers runtime.
 */

/** The range options R2's `get` accepts (a subset of `R2Range`). */
export type R2RangeOption = { offset: number; length?: number } | { suffix: number };

/** The parts of an R2 object this module reads (`R2Object` / `R2ObjectBody`). */
export interface R2Like {
  size: number;
  httpEtag: string;
  /** The byte range R2 returned, when one was asked for. */
  range?: { offset?: number; length?: number; suffix?: number };
  /** Present when the object was read (no `body`: If-None-Match matched). */
  body?: ReadableStream | null;
  writeHttpMetadata(headers: Headers): void;
}

/**
 * The range a `Range` header asks for, as an R2 option. `null`: no usable range, send the
 * whole object (no header, other units, several ranges: the loader never sends those).
 * "invalid": a byte range that can never be satisfied (end before start, "bytes=-0").
 * Whether a start lies past the end of the object is only known from R2 (see the function).
 */
export function rangeRequest(header: string | null): R2RangeOption | null | "invalid" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(header.replace(/\s+/g, ""));
  if (!m) return null;
  const [, a = "", b = ""] = m;
  if (a === "" && b === "") return null;
  if (a === "") {
    const suffix = Number(b);
    return suffix === 0 ? "invalid" : { suffix };
  }
  const offset = Number(a);
  if (b === "") return { offset };
  const end = Number(b);
  if (end < offset) return "invalid";
  return { offset, length: end - offset + 1 };
}

/**
 * First and last byte (inclusive) of what R2 returned, clamped to the object. When R2 does
 * not report a range, the requested one is used (never "the whole object" for a slice).
 */
export function returnedRange(
  object: R2Like,
  requested: R2RangeOption | null = null,
): { start: number; end: number } {
  const size = object.size;
  const r: { offset?: number; length?: number; suffix?: number } = object.range ?? requested ?? {};
  if (r.suffix !== undefined) {
    const length = Math.min(r.suffix, size);
    return { start: size - length, end: size - 1 };
  }
  const start = Math.min(r.offset ?? 0, size);
  const length = Math.min(r.length ?? size - start, size - start);
  return { start, end: start + length - 1 };
}

/** Headers that every answer about an object carries. */
function baseHeaders(object: R2Like, cacheControl: string): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", cacheControl);
  return headers;
}

/**
 * The response for a GET or HEAD of `object`.
 * - no object: 404
 * - GET without a body (If-None-Match matched): 304
 * - a range was asked for: 206 with Content-Range from R2's returned range
 * - otherwise: 200 with the whole object
 */
export function r2Response(
  object: R2Like | null,
  request: { method: string; requested: R2RangeOption | null },
  cacheControl: string,
): Response {
  if (!object) return new Response("Not found", { status: 404 });
  const headers = baseHeaders(object, cacheControl);
  const head = request.method === "HEAD";

  if (!head && !object.body) return new Response(null, { status: 304, headers });

  if (request.requested && !head) {
    const { start, end } = returnedRange(object, request.requested);
    if (end < start) return notSatisfiable(object.size); // nothing left after the start
    headers.set("Content-Range", `bytes ${start}-${end}/${object.size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(object.body ?? null, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(head ? null : (object.body ?? null), { status: 200, headers });
}

/** 416 for a range the object cannot satisfy; `size` when known. */
export function notSatisfiable(size: number | null): Response {
  const headers = new Headers({ "Accept-Ranges": "bytes" });
  if (size !== null) headers.set("Content-Range", `bytes */${size}`);
  return new Response(null, { status: 416, headers });
}

/**
 * The R2 key for a request path under the function's mount point, or null for anything
 * that tries to leave it ("..", empty segments). `/r2/v1/potree/nora/octree.bin` ->
 * `v1/potree/nora/octree.bin`.
 */
export function keyFromPath(segments: readonly unknown[]): string | null {
  if (segments.length === 0) return null;
  for (const s of segments) {
    if (typeof s !== "string" || s === "" || s === "." || s === ".." || s.includes("\\")) {
      return null;
    }
  }
  return segments.join("/");
}
