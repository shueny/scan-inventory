// Pages Function: serves the public demo's data (tiles and JSON) from the private R2 bucket
// bound as DEMO_DATA, at /r2/<key>, with Range support (ADR 0015). The whole site,
// this function included, sits behind Cloudflare Access, so only invited people reach it.
// The logic is in cloudflare/r2Handler.ts (tested with a stub bucket).
import { handleR2Request } from "../../cloudflare/r2Handler";

interface Env {
  DEMO_DATA: R2Bucket;
}

export const onRequest: PagesFunction<Env, "path"> = ({ request, env, params }) => {
  const path = params.path;
  const segments = Array.isArray(path) ? path : path === undefined ? [] : [path];
  // No cast: tsc -p functions checks that the real R2Bucket fits the handler's BucketLike.
  return handleR2Request(request, segments, env.DEMO_DATA);
};
