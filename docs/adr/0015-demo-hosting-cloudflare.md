# 0015 · Public demo on Cloudflare Pages, data from a private R2 bucket, behind Access

Status: proposed (owner chose Cloudflare Pages + Access, 2026-10-09; details to confirm) · 2026-10-10 · Task T9

## Context

PRD 6.2 puts the demo site on a static host and the tiles in a public R2 bucket. The owner decided (option A, 2026-10-09) to use Cloudflare Pages and to let only invited people open the demo, with Cloudflare Access, instead of making it public. Researched facts (sources in the shared notes, `t9-cloudflare-research.md`):

- Access can protect `<project>.pages.dev` and its preview URLs. Production needs one extra step in the dashboard, and the free plan allows 50 users.
- An R2 bucket's public `r2.dev` address cannot be protected by Access; that needs a custom domain on Cloudflare, which the owner does not have. `r2.dev` is also rate-limited and meant for development.
- Pages allows at most 25 MiB per static file; the demo's `octree.bin` is ~395 MB.
- A Pages Function can read a private R2 bucket through a binding; R2 returns the requested byte range, but the 206 response has to be built by the function.
- Functions share the Workers free quota: 100,000 requests a day. Static files are free and unlimited. With Access in front, the Cache API is unavailable, so every tile range is read from R2 (free egress).
- `wrangler r2 object put` stops at 315 MB; larger files need a multipart upload (rclone or the S3 API).

## Options

1. **Pages + a private R2 bucket read through a Pages Function, all behind Access** (one origin).
2. Pages behind Access + a public `r2.dev` bucket for the tiles (PRD 6.2 as written). The tiles would be open to anyone who finds the URL, `r2.dev` is rate-limited, and CORS is needed.
3. Pages + R2 on a custom domain behind Access. This needs a domain on Cloudflare (cost, setup); otherwise it is the cleanest.

## Decision (proposed)

Option 1.

- `web/functions/r2/[[path]].ts` serves `/r2/<key>` from the bucket bound as `DEMO_DATA`. GET and HEAD only, keys checked against `..`, and Range handled in `web/cloudflare/r2Response.ts`: 206 with `Content-Range`, 416, 304 on `If-None-Match`, 404. The module is unit-tested without the Workers runtime.
- `web/public/_routes.json` sends only `/r2/*` to the Function, so the app's own files stay free static assets.
- The demo build (`pnpm --dir web build:demo`, settings in `web/.env.demo`) is static mode with data under `/r2/v1/...`. `v1` is the data version: a new upload goes to `v2` and the review state kept in visitors' browsers starts clean (PRD 8.7).
- `web/wrangler.toml` holds the project name and the R2 binding; `wrangler pages deploy` applies it.
- `scripts/deploy/upload_demo_data.sh` uploads the 13 % tiles and the JSON with rclone (multipart). The owner runs it; CI never handles data.
- `.github/workflows/deploy.yml` builds and deploys on every push to `main` with `cloudflare/wrangler-action@v4`, and skips itself until the owner adds the two secrets.
- Demo UI (PRD 8.7): a banner saying review changes stay in this browser, "Reset demo" with a confirmation, a notice when browser storage is blocked, a loading overlay until the first points are drawn, a WebGL 2 check with a screenshot, a small-screen notice with "Continue anyway", and an About panel.
- Tests: the same Playwright smoke suite runs against the demo stack locally (`pnpm --dir web test:e2e:demo`: `wrangler pages dev` with the fixture plant in a local R2 bucket), in `make gate` and in CI.

## Consequences

- No account, password or token is in the repo; `docs/DEPLOY.md` lists the owner's steps, which need the owner's Cloudflare login.
- Every tile range is a Function request: a close-up view needs about 50, so the 100,000 a day allow roughly a few hundred visits a day. That is enough for invited reviewers; for a public launch, option 3 (custom domain, edge cache) would be better.
- Making the demo public later means removing the Access apps; nothing in the code changes.
- PRD 6.2's "public R2 bucket with CORS" and T9's "verify with a curl Range request" become: private bucket, same origin, and a Range check through Access (a browser check in DevTools, or `curl` with an Access service token).
