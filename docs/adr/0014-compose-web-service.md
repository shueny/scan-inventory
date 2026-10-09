# 0014 · Web app in docker compose, one origin

Status: proposed (owner reviews after the T6–T9 run) · 2026-10-10 · Task T8

## Context

Demo step 1 is "Run `docker compose up` and open the web app", and PRD 6 shows the web app served by nginx inside docker compose. T4's compose file had `db`, `api` and `tiles` only, so the app had to be started separately with `pnpm dev`. T8's done-when ("a fresh clone plus the README steps reproduces the full demo") needs the whole demo from one command.

## Options and decisions

- *Chosen:* a `web` service. `web/Dockerfile` builds the app in api mode (Node 22) and serves it with nginx (`web/nginx.conf`). The same nginx passes `/api/` to the `api` service and serves `data/potree` (mounted read only) at `/potree/` with Range support. The browser talks to one origin, http://localhost:8088, so no CORS is involved, and the app uses the same paths as in development (`/api`, ADR 0010).
- *Not chosen:* pointing the browser at three ports (app, API on 8000, tiles on 8080). That needs CORS for both and a build that knows the other ports.
- The ports of `web`, `api` and `tiles` can be changed in `.env` (`WEB_PORT`, `API_PORT`, `TILES_PORT`; defaults 8088, 8000, 8080). This lets a second copy run next to the owner's, e.g. for the fresh-clone check.
- The `tiles` service stays for direct tile checks and the T4 tests; the app no longer needs it.

## Consequences

- `docker compose up --build` builds two images (api, web) on first run, which takes about a minute.
- The web image is built for api mode; the public demo build (static mode) is a separate build in T9.
