import {
  keyFromPath,
  notSatisfiable,
  r2Response,
  rangeRequest,
  type R2Like,
  type R2RangeOption,
} from "./r2Response";

/** The parts of an R2 bucket binding the handler uses (`R2Bucket`). */
export interface BucketLike {
  head(key: string): Promise<R2Like | null>;
  get(key: string, options: { range?: R2RangeOption; onlyIf: Headers }): Promise<R2Like | null>;
}

// Keys carry a data version (v1/...), so a new upload uses new URLs; within a version the
// files never change. "private": behind Access, nothing should cache it for others.
export const CACHE_CONTROL = "private, max-age=86400";

/** Whether `range` starts at or past the end of an object of `size` bytes. */
function pastTheEnd(range: R2RangeOption, size: number): boolean {
  return "offset" in range && range.offset >= size;
}

/**
 * The demo's data endpoint (ADR 0015): GET/HEAD /r2/<key> from a private bucket, with Range.
 * Kept apart from the Pages Function file so it can be tested with a stub bucket.
 */
export async function handleR2Request(
  request: Request,
  pathSegments: readonly unknown[],
  bucket: BucketLike,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const key = keyFromPath(pathSegments);
  if (!key) return new Response("Not found", { status: 404 });

  if (request.method === "HEAD") {
    return r2Response(await bucket.head(key), { method: "HEAD", requested: null }, CACHE_CONTROL);
  }

  const range = rangeRequest(request.headers.get("Range"));
  if (range === "invalid") return notSatisfiable((await bucket.head(key))?.size ?? null);

  // Only If-None-Match is passed on, so "no body" always means "not modified" (304).
  const onlyIf = new Headers();
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch) onlyIf.set("If-None-Match", ifNoneMatch);

  try {
    const object = await bucket.get(key, range ? { range, onlyIf } : { onlyIf });
    return r2Response(object, { method: "GET", requested: range }, CACHE_CONTROL);
  } catch (error) {
    // R2 refuses a range that starts past the end; answer 416 only when that is the reason.
    // Any other failure (timeout, internal error) stays an error: 5xx, and it is logged.
    if (range) {
      const meta = await bucket.head(key);
      if (meta && pastTheEnd(range, meta.size)) return notSatisfiable(meta.size);
    }
    throw new Error(`R2 read failed for ${key}`, { cause: error });
  }
}
