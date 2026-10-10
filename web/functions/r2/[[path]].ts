// Pages Function: serves the public demo's data (tiles and JSON) from the private R2 bucket
// bound as DEMO_DATA, at /r2/<key>, with Range support (ADR 0015). The whole site,
// this function included, sits behind Cloudflare Access, so only invited people reach it.
import { keyFromPath, notSatisfiable, r2Response, rangeRequest } from "../../cloudflare/r2Response";

interface Env {
  DEMO_DATA: R2Bucket;
}

// Keys carry a data version (v1/...), so a new upload uses new URLs; within a version the
// files never change. "private": behind Access, nothing should cache it for others.
const CACHE_CONTROL = "private, max-age=86400";

export const onRequest: PagesFunction<Env, "path"> = async ({ request, env, params }) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const path = params.path;
  const key = keyFromPath(Array.isArray(path) ? path : path === undefined ? [] : [path]);
  if (!key) return new Response("Not found", { status: 404 });

  if (request.method === "HEAD") {
    return r2Response(
      await env.DEMO_DATA.head(key),
      { method: "HEAD", ranged: false },
      CACHE_CONTROL,
    );
  }

  const range = rangeRequest(request.headers.get("Range"));
  if (range === "invalid") return notSatisfiable((await env.DEMO_DATA.head(key))?.size ?? null);

  // Only If-None-Match is passed on, so "no body" always means "not modified" (304).
  const onlyIf = new Headers();
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch) onlyIf.set("If-None-Match", ifNoneMatch);

  let object: R2ObjectBody | R2Object | null;
  try {
    object = await env.DEMO_DATA.get(key, { ...(range ? { range } : {}), onlyIf });
  } catch {
    // R2 refuses a range that starts past the end of the object.
    if (range) return notSatisfiable((await env.DEMO_DATA.head(key))?.size ?? null);
    throw new Error(`R2 read failed for ${key}`);
  }
  return r2Response(object, { method: "GET", ranged: range !== null }, CACHE_CONTROL);
};
