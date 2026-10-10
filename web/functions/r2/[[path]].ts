// Pages Function: serves the public demo's data (tiles and JSON) from the private R2 bucket
// bound as DEMO_DATA, at /r2/<key>, with Range support (ADR 0015). The whole site,
// this function included, sits behind Cloudflare Access, so only invited people reach it.
import { keyFromPath, r2Response } from "../../cloudflare/r2Response";

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
  const segments = Array.isArray(params.path) ? params.path : [params.path];
  const key = keyFromPath(segments);
  if (!key) return new Response("Not found", { status: 404 });

  const rangeHeader = request.headers.get("Range");
  const object =
    request.method === "HEAD"
      ? await env.DEMO_DATA.head(key)
      : await env.DEMO_DATA.get(key, {
          range: request.headers,
          onlyIf: request.headers,
        });
  return r2Response(object, { method: request.method, rangeHeader }, CACHE_CONTROL);
};
