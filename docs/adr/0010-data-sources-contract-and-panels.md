# 0010 · Generated types, data source contract tests and inventory panels

Status: proposed (needs owner confirmation) · 2026-10-09 · Task T5

The owner asked for T5 to run to the end without stopping, so each choice below was made with the recommended option and is listed here for review. Each one can be changed on its own.

## Context

T5 connects the frontend to both data sources (PRD 6.1) and adds the inventory panels (PRD 8.4). Five questions had more than one reasonable answer: how the TypeScript types are generated and kept in step with the API; how one contract test suite runs against both data sources (PRD 6.1: "propose which"); how the demo keeps review changes in the browser; how the zone filter shows in 3D; and how the app reaches the API.

## Options and decisions

**1. Generated types**
- *Chosen:* `python -m app.openapi` writes the schema from the FastAPI app (no server, no database) to `web/src/data/openapi.json`; `openapi-typescript --array-length` turns it into `web/src/data/api-schema.d.ts`. Both files are committed. `make types` runs both steps. Two tests fail when they drift: `api/tests/test_openapi.py` (API changed, schema file not) and `web/src/data/apiSchema.test.ts` (schema changed, types not). `web/src/data/types.ts` only gives the generated schemas short names.
- *Not chosen:* generating from a running server (needs the API up for every frontend build) or generating at build time without committing (a code review would not show type changes).

**2. Contract tests for both data sources**
- *Chosen:* one suite (`web/src/data/contract/suite.ts`, 14 tests) runs against both sources on the same data, the API's own fixtures (`api/tests/fixtures/`). StaticDataSource reads the fixture files and keeps events in memory. ApiDataSource talks to the real API: `api/tests/contract_server.py` starts a throwaway Postgres (testcontainers, as in ADR 0009), migrates, seeds the fixtures and serves the app on a free port; a test-only route `POST /__test__/reset` restores the fixtures before each test. `pnpm test:contract` runs it and `make check` includes it (needs Docker, like `check-api`).
- *Not chosen:* a mocked API (it would test the mock, not the API) or the `docker compose` stack (shared ports, and the tests would write into the owner's local review history).

**3. Review changes in the static demo**
- *Chosen:* an append-only event list in `localStorage` under `scan-inventory:<scan>:v1:events`, with the same fields as the API's `review_event`. The current state is always the static JSON with every event replayed on top. The rules that turn a change into events (`web/src/domain/review.ts`) mirror `api/app/services.py` step by step, including the order of the checks (422 for the request body, then 404, then 409), so the contract suite passes for both. If storage is blocked or full, events stay in memory for the page and `isPersistent()` says so (for the demo banner in T9).
- *Not chosen:* storing the current state instead of events (no history, and a second state model to keep in step with the API).

**4. Zone and other filters in 3D**
- *Chosen:* the PRD 8.3 fallback. When any filter is active, the objects that pass it get a thin dark outline drawn over the points; filtered-out points stay visible. The loader cannot dim single objects: its only per-region tool is clip boxes, at most 30, and there are 260 objects. One `LineSegments` holds all outlines, so this costs a single draw call.
- *Not chosen:* a custom shader that dims points by `point source id` (the right long-term answer, but it means patching the loader's shader; worth a separate task if the outlines are not enough).

**5. How the app reaches the API**
- *Chosen:* same origin. The app calls `/api/...` (`VITE_API_BASE_URL`, default `/api`), as behind nginx in PRD 6; the Vite dev and preview servers proxy `/api` to `http://127.0.0.1:8000` (override with `API_PROXY_TARGET`). The API's CORS setting stays as the safety net.
- *Not chosen:* calling `http://localhost:8000/api` directly (works only from port 5173, the one origin CORS allows).

## Other choices made inside T5

- `ScanDataSource` gets the API's three errors as classes: `NotFoundError` (404), `InvalidChangeError` (422), `ConflictError` (409). ApiDataSource maps HTTP status codes to them, so the UI shows the same message in both modes.
- `listInstances` returns all 263 objects in both modes (`?include_background=true`); filtering, counting and sorting are pure functions in `web/src/domain/filters.ts`.
- StaticDataSource returns exactly the API's fields, derived the same way: class name from the scan's class list, box size from the box, class counts computed from the objects.
- Table: hand-written with sortable headers (`aria-sort`), keyboard selection and no table library; 263 rows need neither virtual scrolling nor column features.
- Background rows in the table have their own toggle ("List structure and floor in the table", off by default, PRD 8.4). The 3D toggle from ADR 0007 is unchanged.
- Counts next to zones and classes are over all objects, not the current filter result, so they do not jump while filtering. Class counts use the current (possibly corrected) class.
- Fixed in passing (T3 code): in development, React StrictMode creates the viewer twice and the first one's load marked the view ready, so the class colours were sometimes not applied until the colour mode was toggled. The viewer now remembers the colour mode and applies it once its point cloud has loaded.

## Consequences

- An API change that touches a response or request shape fails `make check` until `make types` is run and both files are committed.
- `make check` needs Docker for the web part too, and takes a few seconds longer for the contract run.
- Point colours in 3D come from the tiles, so a corrected object keeps its annotated colour in 3D; the table, legend counts and detail panel show the corrected class. Recolouring corrected objects in 3D needs the shader work from option 4.
- `review.ts` and `services.py` describe the same rules twice, in two languages. The contract suite is what keeps them equal; a new rule needs a contract test first.
