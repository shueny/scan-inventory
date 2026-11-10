# Learning log

One entry per task: what was built, key concepts in plain language, why, and quiz questions.

---

## T0 · Repo scaffold

### What was built

An empty but working skeleton:

- `scripts/` (pipeline) and `api/` (FastAPI) as two separate Python projects, each with `pyproject.toml` and `uv.lock`.
- `web/` with only eslint and prettier for now. The Vite app comes in T3.
- `docs/PRD.md` (copy of the spec), `docs/adr/`, this file, and `CLAUDE.md`.
- `.gitignore` that keeps all scan data out of git, `docker-compose.yml` placeholder, `Makefile` with `make check`, and `.pre-commit-config.yaml`.

### Key concepts

- **Lockfile** (`uv.lock`, `pnpm-lock.yaml`): `pyproject.toml` says "I need ruff 0.16 or newer". The lockfile records the exact version that was actually installed, so every machine and every Docker build gets the same code.
- **uv**: one tool that installs Python, creates the virtual environment and installs packages. `uv run X` runs X inside the project's environment, so you never "activate" a venv by hand.
- **Pre-commit hook**: a check that runs automatically on `git commit`. If ruff or mypy fails, the commit is blocked. It catches mistakes before they reach the repository.
- **Linter vs formatter vs type checker**: ruff/eslint find likely bugs and bad patterns; ruff format/prettier only change layout; mypy/tsc check that types fit together. Three different questions.
- **Why data is gitignored**: git keeps every version of every file forever. A 3.25 GB point cloud would make the repo unusable, and the dataset has its own home (Zenodo).

### Why this way

See [ADR 0001](adr/0001-repo-layout-and-tooling.md). In short: each part (pipeline, API, web) has its own dependencies and can be built and tested on its own; they only talk through JSON files and HTTP. The root `Makefile` gives one command for the whole quality gate.

### Quiz

1. What is the difference between `pyproject.toml` and `uv.lock`, and which one do you edit by hand?
2. Why do the pre-commit hooks call `uv run ruff` instead of downloading their own copy of ruff?
3. `scripts/` and `api/` could use different numpy versions. Why is that acceptable here?

---

## T1 · Pipeline: instances + issues

### What was built

- `scripts/pnid.py`: reads the P&ID CSV into typed `PnidRow` objects (trimmed cells, `2 1/2"` -> 2.5, `"177,175"` -> (177, 175)). Shared by both scripts.
- `scripts/build_instances.py` (moved from the repo root, now typed): one pass over the 3.25 GB PLY in 2M-point chunks, one record per object. New: `scan_id`, `has_tag`, `location_source = tagged_nearest_tag`.
- `scripts/class_mapping.py`: P&ID element type -> allowed class ids, reviewed by the owner.
- `scripts/build_issues.py`: six rules, each a small pure function, writing `data/issues.json`.
- `docs/data-schema.md`: every output field explained.
- 29 unit tests on tiny synthetic data (a 12-point PLY written by the test itself), including one that checks two runs give byte-identical output.

### Key concepts

- **Chunked processing**: the PLY is memory-mapped (the OS reads parts of the file only when touched) and processed 2 million points at a time. For each chunk we only add to running totals per instance: count, sum of x, sum of x², min, max. Totals can be added across chunks; the final mean and spread are computed from them at the end. That is why memory stays flat no matter how big the file is.
- **`np.bincount` as group-by-sum**: `bincount(instance_ids, weights=x)` returns, for every instance id, the sum of x over its points. One call replaces a Python loop over 151 million points.
- **PCA estimates**: the covariance of an object's points tells how spread out it is in each direction. For a straight pipe the largest spread is along the pipe; points spread evenly along length L have variance L²/12, so L = √(12·variance). For a bent pipe the spread goes in two directions and the "diameter" becomes large — that is exactly what `estimate_unreliable` detects (diameter > 0.3 m).
- **Pure functions for rules**: each rule takes plain data in and returns a list of issues, with no file reading or printing inside. That makes each one testable with three lines of fake data.
- **Rules, not hard-coding**: the PRD lists the known problems (instance 1, PT-108A, …). The code never mentions them; the tests use fake ids, and running on the real data must find them by itself. If it does, the rules are right.

### Why this way

- Class mapping decisions (pumps allow Motor or Piping components, ball valve suggestion by size): [ADR 0002](adr/0002-class-mapping-for-mismatch-rule.md).
- `tagged_nearest_tag`, `has_tag`, primary tag = first P&ID row: [ADR 0003](adr/0003-location-source-values.md).
- `suggested_action` is null when a rule has no concrete fix (e.g. a tag missing from the scan): the tool should not pretend to know the answer.

### Quiz

1. The PLY is 3.25 GB. Why does `build_instances.py` stay far below that in memory, and which values does it keep per instance between chunks?
2. Pipe 169's P&ID row says "1/2" ball valve" but it is annotated as Pipe with an estimated length of 1.24 m. Which rule catches it, what does it suggest, and why that class?
3. Why does `tag_split` exist when pumps already allow both Motor and Piping components in the class mapping?

---

## T2 · Spike: LAS export, PotreeConverter, loader

### What was built

- `scripts/export_las.py`: streams nora.ply into LAS 1.4 (point format 7) in 2M-point chunks. Class id goes into `classification`, instance id into `point_source_id`. Optional deterministic sampling: `--sample 0.13` (random, fixed seed) or `--voxel-size 0.005` (one point per cube). Writes a `.stats.json` next to the LAS with how many points each object kept.
- `scripts/potree/build_converter.sh` + `potreeconverter-2.1.2-macos.patch`: builds PotreeConverter natively on Apple Silicon (ADR 0004).
- `scripts/build_potree.sh`: LAS -> Potree 2.0 tiles (`metadata.json`, `hierarchy.bin`, `octree.bin`), keeping only `rgb`, `classification`, `point source id`.
- `scripts/verify_potree.py`: decodes `octree.bin` and proves every instance kept all its points and its class.
- Two throwaway viewer pages (outside the repo) to test the two loader candidates. Findings in `docs/spikes/T2-report.md`.

### Key concepts

- **LAS**: the standard file format for laser scans. Every point has fixed fields (x, y, z, colour, classification, point source id, …). Coordinates are stored as integers plus a scale and offset (`x = int * 0.0001 + offset`), which gives 0.1 mm precision in 4 bytes.
- **Reusing a standard field**: `point_source_id` normally says which scan position a point came from. We do not need that, so we store the instance id there. Any LAS tool keeps it, and no custom "extra bytes" are needed.
- **Octree / level of detail**: PotreeConverter sorts points into a tree of cubes. The root cube holds a thin, evenly spread sample of the whole scan; each child cube adds more detail for a smaller area. The browser first loads the root (~0.3 MB here), then only the children near the camera, until the point budget (3M points) is used.
- **HTTP Range requests**: all nodes live in one big `octree.bin`. The browser asks for `Range: bytes=A-B` and gets just that node (`206 Partial Content`). That is why tiles can be plain static files: no tile server needed.
- **GPU picking**: to find what is under the mouse, the loader renders the points once more into a hidden image where each pixel's colour encodes "which point is this". It reads that one pixel back and returns the point's attributes, including `point source id` = our instance id.
- **Random vs voxel sampling**: random keeps each point with the same probability, so dense areas stay dense. Voxel keeps one point per small cube, so point density becomes even everywhere; flat, densely scanned surfaces (floor, walls) lose the most.

### Why this way

- Native build with our own patch instead of Docker or an unmerged fork: [ADR 0004](adr/0004-potreeconverter-native-macos-build.md).
- Loader and picking: [ADR 0005](adr/0005-potree-loader-and-picking.md). The less obvious finding: both loaders look the same on paper, but only one colours Potree 2.0 data by classification correctly. Reading the shader source found the reason.
- Sampling method: [ADR 0006](adr/0006-demo-sampling.md).

### Quiz

1. Why can the tiles be served by a plain static file server (nginx, R2) without any tile API? What must the server support, and what goes wrong if it does not?
2. Where is the instance id stored in the LAS file, and how did we prove it survives PotreeConverter?
3. `potree-core` and `@pnext/three-loader` share most of their code. Which differences decided the choice, and how were they found?

---

## T3 · Viewer

### What was built

- `scripts/build_scan_meta.py` + `scripts/class_palette.py`: `data/scan.json` with the class list, one colour per class and the zones. The one place colours are defined.
- `web/`: Vite + React 18 + TypeScript (strict) + Tailwind app with a three-column layout (legend, 3D, details) and the dataset credit in the footer.
- `web/src/data/`: the `ScanDataSource` interface from PRD 6.1 and `StaticDataSource` (reads the pipeline's JSON files, read-only for now), plus TanStack Query hooks.
- `web/src/viewer/Viewer.ts`: plain Three.js class with the Potree loader (3M point budget), Z-up orbit camera, class/scan colour modes, background toggle, click picking, selection box and a 700 ms fly-to.
- `web/src/domain/`: pure functions for the fallback ray/box pick, colour tables and camera framing, with unit tests.
- `web/src/state/viewStore.ts`: one Zustand store for the selection and view options, shared by the 3D view and the panels.

### Key concepts

- **Imperative core, declarative shell**: Three.js and the loader work by calling methods (`select`, `setColorMode`) on long-lived objects. React works by describing UI from state. The `Viewer` class is the imperative core; `ViewerCanvas` watches the store and calls the right method when something changes. Each side does what it is good at.
- **UI state vs server state**: "which object is selected" belongs to the browser (Zustand). "What objects exist" belongs to the data source (TanStack Query caches it and handles loading/error). Keeping them apart means the same panels work with the static demo and, in T5, with the API.
- **Data source interface**: components ask `useInstances()`, never `fetch('/data/instances.json')`. Swapping where data comes from is then a one-line change in `createDataSource()`.
- **Shader filtering**: the GPU decides per point whether to draw it. The loader passes a 256-entry true/false table indexed by class id; background classes set to false are skipped, in both colour modes and in picking.
- **Fitting a box in view**: take a sphere around the box; the camera must be `radius / sin(half field of view)` away so the sphere touches the edges. A narrow panel has a smaller horizontal field of view, so the narrower one decides.

### Why this way

[ADR 0007](adr/0007-viewer-architecture.md): plain Three.js class instead of react-three-fiber, background shown in light grey, scan metadata from the pipeline.

### Quiz

1. You click a valve in 3D. Trace what happens until the right panel shows its tag: which classes, store and hooks are involved, in order?
2. Why can the background toggle hide Structural and Floor in both colour modes, and why does hiding them not make the page download less data?
3. The demo should later run without a server. What in T3 already prepares for that, and what is still missing?

---

## T4 · API + DB

### What was built

- `api/app/`: FastAPI service. `models.py` (SQLAlchemy tables), `schemas.py` (Pydantic request/response models, which also define the OpenAPI schema), `services.py` (business rules and transactions), `routes.py` (the seven endpoints of PRD 8.2), `seed.py` (idempotent CLI), `main.py` (CORS, error-to-status mapping).
- `api/migrations/`: Alembic migration `0001` that creates the five tables.
- `docker-compose.yml`: `db` (Postgres 16), `api` (migrate → seed → serve on 127.0.0.1:8000), `tiles` (nginx serving `data/potree` with Range on 127.0.0.1:8080). Credentials in `.env`.
- 45 API tests on a throwaway Postgres container, including two "failure writes nothing" tests and a test that the migration matches the models.

### Key concepts

- **Transaction**: a group of database changes that either all happen or none do. Resolving an issue changes the object, the issue and writes several history rows; if anything fails half-way, `rollback()` undoes all of it. The tests force a failure in the middle and check that nothing changed.
- **Append-only history**: `review_event` rows are only ever inserted, never updated or deleted. The current state lives in `instance` and `issue`; the history explains how it got there (who, when, from what to what).
- **Migration**: a versioned script that changes the database schema (`alembic upgrade head`). The schema is code, reviewed and repeatable, instead of hand-made tables.
- **Idempotent seed**: running it twice has the same effect as running it once. On restart it sees the scan already exists and does nothing, so review changes are not overwritten.
- **Foreign key as a rule**: `current_class_id` must point to an existing row in `scan_class`. Even a bug in the code cannot store a class that does not exist; the database refuses it.
- **Status codes**: 404 = the thing does not exist, 422 = the request is understandable but not allowed (missing class, unknown class, closing with a wrong action), 409 = conflicts with the current state (issue already closed), 500 = our bug.
- **testcontainers**: the tests start a real Postgres in Docker and throw it away afterwards. Tests run against the same database engine as production, not a fake.

### Why this way

[ADR 0009](adr/0009-api-data-model-and-tests.md): arrays + `scan_class` table, seed as a CLI run on container start, testcontainers for tests. Point data never touches the API or the database (PRD 6).

### Quiz

1. `POST /issues/class_mismatch:1/resolve` with `accept_suggestion`: which rows change and which rows are inserted? What happens to them if the last insert fails?
2. Why does restarting the `api` container not reset the review decisions, and what does?
3. Why does the API return 422 for `{"current_class_id": 99}` but 404 for `/instances/999`, and where in the code is each decided?

---

## T2 follow-up · export_las.py edge cases (verification D3–D6, D8, D9)

### What was built

Fixes for the low-severity findings in `docs/spikes/T2-verification.md`, each with a unit test on a tiny synthetic PLY that failed before the fix:

- **D3** The LAS header date is a constant (`CREATION_DATE`, [ADR 0008](adr/0008-fixed-las-creation-date.md)), so the same input gives the same bytes on any day.
- **D4, D5** A new `to_int_ids()` checks instance and class ids for every chunk *before* they are counted: NaN/inf, negative and too large ids stop the run with a clear message instead of a NumPy traceback or a silent instance 0.
- **D6** The LAS is written to `<out>.tmp` and renamed to `<out>` only when everything succeeded. A failed run deletes the temp file and leaves the previous good LAS alone.
- **D8** `--voxel-size nan` and `inf` are rejected.
- **D9** The docstring and `--out` default use `data/las/nora.las`; an empty PLY stops with "has no points".

Real-data check (`--sample 0.05`): old and new LAS differ in one byte (the day of year in the header), stats are identical, `verify_potree.py` passes (7,600,555 points, 263 instance/class pairs). Side finding: PotreeConverter itself is not byte-reproducible, so tiles still differ between runs (ADR 0008).

Not fixed: the voxel key overflow below ~4.5 µm (D9, unreachable) and the report's unit slips (D7, documentation only).

### Key concepts

- **Reproducible build**: same input + same code = same output bytes. Anything taken from the environment (today's date, random seeds, file order) breaks it. Byte-identical output lets a later step use a file hash to answer "did anything change?".
- **NaN does not compare**: `nan <= 0` and `nan > 0` are both False, so `if x <= 0: reject` lets NaN through. Check "is it a good value" (`isfinite(x) and x > 0`) instead of "is it a bad value". Casting NaN to an integer is undefined: arm64 gives 0, x86 gives the most negative int64.
- **Validate before use**: the range check existed, but ran after `np.bincount`, which already crashed on the bad id. A guard only helps if it runs first.
- **Atomic replace**: write to a temp file in the same folder, then `rename`. On one file system a rename is atomic: readers see either the old file or the complete new one, never a half-written one.

### Why this way

- Temp file + rename instead of "refuse to overwrite": reruns stay convenient, and a failure still cannot destroy the previous output.
- Ids are now checked on every point, not only on sampled points. A bad id in the source is a data error even if sampling would have dropped it.
- Constant date: see ADR 0008 (accepted).

### Quiz

1. Why did `--voxel-size nan` pass the old check `args.voxel_size <= 0`, and how does the new check catch it?
2. The old code had a friendly "does not fit point_source_id" message. Why did nobody ever see it for an id of 70000?
3. An export is interrupted by Ctrl+C at 80 %. What is on disk afterwards, old code vs new code?

---

## T5 · Inventory and detail panels

### What was built

- **Generated types**: `python -m app.openapi` exports the API's OpenAPI schema to `web/src/data/openapi.json`; `openapi-typescript` turns it into `web/src/data/api-schema.d.ts`. `make types` does both. A test on each side fails if the two drift apart.
- **`ApiDataSource`**: the `ScanDataSource` interface over the FastAPI endpoints. HTTP 404/422/409 become `NotFoundError`/`InvalidChangeError`/`ConflictError`. The app calls `/api` on its own origin; the Vite dev server proxies it to `docker compose`'s API on port 8000.
- **Write support in `StaticDataSource`**: review changes are an append-only event list in `localStorage`; the current state is the static JSON with all events replayed. The rules (`web/src/domain/review.ts`) mirror the API's `services.py`. Blocked or full storage falls back to memory.
- **Contract tests**: one suite of 14 tests (`web/src/data/contract/suite.ts`) runs against both data sources on the same fixtures. The API side runs against the real API on a throwaway Postgres (`api/tests/contract_server.py`). `pnpm test:contract`; part of `make check`.
- **Panels**: left filter panel (tag search, zones with counts, system, review status, classes with colour and counts, background rows toggle); sortable inventory table under the 3D view (click or Enter = select and fly to); detail panel with confirm / reject / change class, an optional note and the history list.
- **3D**: objects that pass the filters get a dark outline when a filter is active (the loader cannot dim single objects). Fixed a T3 race that sometimes left the view in scan colours on first load in development.

Demo steps checked in the browser at 1440 × 900, in static mode and in api mode (against a throwaway database with the real data): 3 (zones with counts, untick → list shrinks, outlines in 3D), 5 (row click → fly-to and details), 7 single object (confirm with a note, change class, history entry, still there after a reload). Step 4 (click in 3D) uses the T3 picking unchanged; the detail panel it opens is the one tested here.

### Key concepts

- **Contract test**: one list of expectations ("confirming twice writes one event", "an unknown class is a 422") run against every implementation of an interface. If the static demo and the API ever behave differently, a test names the difference.
- **Event sourcing (small)**: store what happened ("status unreviewed → confirmed", "class 9 → 2"), not the result. The result is computed by replaying the events. History comes for free, and "reset demo" is deleting the list.
- **Same rules, two places**: the API checks a change inside a database transaction; the demo plans it on a copy of the state and only appends the events if every check passed. Both are "all or nothing", done differently.
- **Generated types**: the API's Pydantic models are the single source. If `review_status` gains a value, the generated TypeScript type changes and the compiler points at every place that must handle it.
- **Same-origin API**: the browser blocks calls to another origin unless the server allows it (CORS). Serving the app and `/api` from one origin (a dev proxy now, nginx later) removes that whole class of problem.
- **Client-side filtering**: 263 rows is small. Filtering, counting and sorting in the browser make every filter instant and work the same in both modes.

### Why this way

[ADR 0010](adr/0010-data-sources-contract-and-panels.md) (accepted): committed schema + generated types with drift tests; contract suite on the API's fixtures against a throwaway API; event list in `localStorage`; outlines as the 3D filter fallback; same-origin `/api` with a dev proxy.

### Quiz

1. You confirm an object in the public demo, then reload the page. Where is the change stored, and how does the page rebuild the object's current status from it?
2. A teammate adds a new review status to the API's `schemas.py` but forgets `make types`. Which test fails first, and what does the fix look like?
3. Why does the contract suite run against a throwaway database instead of the `docker compose` database, and what would go wrong if two tests shared data without the reset?

---

## T6 · Review queue

### What was built

- **Issue history**: the API returns each issue with the review events written while resolving it (`IssueOut.history`); the static demo does the same from its browser event log. The contract suite checks both, including an issue with no objects.
- **Queue rules** (`web/src/domain/issues.ts`): the actions each issue offers, the order (severity, then type), open counts per severity, and who/when closed an issue.
- **Queue UI**: a "Review queue (n)" tab under the 3D view. Open issues are grouped under headings like "▲ High · Class mismatch (2)"; resolved ones show who, when and what changed. Selecting an issue selects its first object (3D fly-to and detail panel).
- **Resolve flows** per type: accept the suggested class, change class, assign a tag from the ranked candidates or typed, or close with a type-specific reason, each with an optional note.
- **Tests**: component tests on the real `StaticDataSource` with the fixture plant (every issue type can be closed), and a smoke test that resolves an issue in the browser and finds it under "Resolved" after a reload.

Browser check on the real data (45 issues): static mode, assigning PT-108A to transmitter 2; api mode against a throwaway database, accepting the safety-valve suggestion for PSV-103A with a note (3 events in `review_event`, issue resolved, object class 12 after a reload).

### Key concepts

- **Data-driven UI rules**: which buttons an issue shows follows from its data ("has a class suggestion", "has exactly one object"), mirroring what the API accepts. The UI cannot offer an action that the server would refuse.
- **One request, many answers**: the issue list reads every issue's events with one query and groups them in memory, instead of one query per issue (the "N+1" problem).
- **Cache update from the answer**: resolving returns the closed issue and every changed object; the app writes those into the cache, so the queue, the table, the detail panel and the counts change together without reloading everything.
- **Dismissed vs resolved**: "resolved" means the data was changed (class, tag); "dismissed" means the reviewer decided the data is right as it is. Both close the issue and both are in the history.

### Why this way

[ADR 0012](adr/0012-review-queue.md) (accepted): history on each issue, actions per type driven by the data, queue as a tab under the 3D view.

### Quiz

1. Why can the resolved tab not get the history of `tag_missing_in_scan:PCV-104A` from the object's history, and where does it come from instead?
2. A `tag_split` issue has two objects. Why does the queue not offer "Change class" or "Assign tag" for it, and which part of the code decides that?
3. After you accept a class suggestion, the table row, the detail panel and the open count all change at once. Which code makes that happen without reloading the page?

---

## T7 · Dashboard and export

### What was built

- `web/src/domain/summary.ts`: objects per zone split by class family, estimated pipe length per zone with the unreliable share, review progress and open issues per severity. Pure functions with unit tests, plus a test on the real inventory that checks the PRD's numbers (85 pipes, ≈ 110 m, 24 unreliable).
- `web/src/domain/exportCsv.ts`: the inventory as CSV, built in the browser from the current (filtered) list, with current class, annotated class and review status.
- A "Dashboard" tab under the 3D view: a stacked bar chart per zone (Recharts), the pipe length table labelled "estimate (PCA)", review progress, open issues, and the export button.
- A smoke test that reviews an object, opens the dashboard and downloads the CSV, then reads the file and checks the review status in it.

Browser check on the real data, static and api mode: 7 zones, 85 pipes, ≈ 110.2 m, 24 unreliable pipes (66 % of the length), open issues 2 / 15 / 28.

### Key concepts

- **Derived numbers, one place**: the dashboard never stores totals; it computes them from the same instance list the table shows. A correction in the review queue changes the chart at once, in both modes.
- **Estimate vs measurement**: the pipe length is a sum of PCA guesses. Showing the unreliable share next to it says how much of the number to trust, instead of hiding it.
- **CSV is a format with rules**: a value with a comma or a quote must be quoted, and quotes doubled. Spreadsheets also run cells that start with `=` as formulas, so text like that is defused with a leading `'`.
- **Charts and screen readers**: a chart is a picture. The same numbers are also given as a table that only screen readers see.

### Why this way

[ADR 0013](adr/0013-dashboard-and-export.md) (accepted): families from the class palette, "SW - SE" as its own zone, export of the filtered list.

### Quiz

1. You change pipe 96 to "Piping components" in the review queue. Which dashboard numbers change, and why does no code have to "update the dashboard"?
2. Why does the CSV writer put a `'` in front of a tag like `=SUM(A1)` but not in front of the number `-0.5`?
3. The pipe table says "≈ 110.2 m, 24 · 66 %". What does each number mean, and which PRD rule decides "unreliable"?

---

## T8 · Polish and docs

### What was built

- **README.md**:
  - what the project is, with the honest framing (annotations stand in for AI detections);
  - an architecture diagram;
  - how to install the tools (including PotreeConverter on Apple Silicon), get the data, run the pipeline and start the app;
  - the quality gate, performance numbers, known limitations and the dataset credit.
- **A `web` service in docker compose** ([ADR 0014](adr/0014-compose-web-service.md)): nginx serves the app, passes `/api` to the API and serves the tiles with Range support. `docker compose up` then gives the whole demo at http://localhost:8088, as demo step 1 says. Ports can be changed in `.env`.
- **A fresh-clone check**: the README steps were run in a new clone, with the 13 % sample tiles and a second compose stack on other ports, and the demo path was clicked through there.
- **Performance numbers**, measured on the MacBook Air M3 with `web/perf/measure-orbit.mjs` (`pnpm --dir web perf`):
  - while orbiting with up to 373k points drawn, it holds the 144 Hz display rate (median 6.9 ms, worst 8.8 ms, no frame over 33 ms);
  - first points after 1.6–4.8 s;
  - JS bundle 508 KB gzipped.
  The level-of-detail rule kept the points drawn at about 370k, so the 3M budget was never reached. (Superseded by T10: with `minNodePixelSize` 50 the budget is reached at mid zoom, and first points were re-measured; see [ADR 0016](adr/0016-point-detail-and-shape.md).)
- The Playwright smoke test now covers demo steps 3 to 9 on the fixture plant, including clicking an object in 3D (step 4); it fails if picking is switched off.

### Key concepts

- **Reproducibility is tested, not assumed**: a README is only right if someone (or a script) follows it from a clean clone. The check runs each step and records its exit code and duration.
- **Level of detail**: the loader draws an octree node only when it would cover enough pixels (T10 states the exact rule: the child's projected bounding-sphere radius in device pixels against `minNodePixelSize`). At the loader's old 200 px default, the whole-plant view stayed on the root tile (13,105 points). Zooming in fetches finer nodes with Range requests. Speed comes from not loading what you cannot see.
- **Frame rate is capped by the display**: browsers present at most once per screen refresh (144 Hz here). A steady interval at that period means the view kept up. It is not GPU time, and a frame that finishes early still waits, so the figure does not show spare capacity. Record every frame's time and report the median, the 99th percentile and the worst frame, not a per-second average, which hides single slow frames. With vsync off the numbers look faster, but they mostly measure how fast the browser schedules frames, not the GPU (review round 2 of T8).
- **One origin**: when the app, the API and the tiles come from the same host and port, the browser applies no cross-origin rules, and the app code uses the same paths everywhere.

### Why this way

[ADR 0014](adr/0014-compose-web-service.md) (accepted): nginx serves the app, the API proxy and the tiles from one origin.

### Quiz

1. You open the app and the plant looks coarse until you zoom in. Is that a bug? What decides which tiles are loaded?
2. Why does the web container proxy `/api` instead of the browser calling the API on port 8000 directly?
3. The report gives "median 6.9 ms, worst 8.8 ms" for every view. What do these numbers prove about the PRD target, and what can they not tell you?

---

## T9 · Public demo deployment

### What was built

- **Demo mode** (PRD 8.7):
  - a banner saying review changes are saved only in this browser, with "Reset demo" (asks first);
  - a notice when browser storage is blocked;
  - a loading overlay until the first points are drawn;
  - a WebGL 2 check with a screenshot;
  - a small-screen notice with "Continue anyway";
  - an About panel (framing, architecture, repository, dataset credit);
  - review changes kept per data version (`VITE_DATA_VERSION`).
- **Cloudflare** ([ADR 0015](adr/0015-demo-hosting-cloudflare.md)):
  - a Pages Function (`web/functions/r2/[[path]].ts`) serves the demo's tiles and JSON from a private R2 bucket at `/r2/...`;
  - Range handling, unit-tested, is in `web/cloudflare/r2Response.ts`: 206 with Content-Range, 416, 304, 404, GET/HEAD only, no `..`;
  - `_routes.json` sends only `/r2/*` to the Function;
  - `wrangler.toml` binds the bucket;
  - the demo build settings are in `web/.env.demo`.
- **The demo stack, tested locally**: `pnpm --dir web test:e2e:demo` builds the demo, puts the fixture plant into a local R2 bucket, starts `wrangler pages dev` (the Cloudflare runtime) and runs the full smoke suite against it. It is part of `make gate` and CI.
- **Owner tools**:
  - `scripts/deploy/upload_demo_data.sh` uploads with rclone in 100 MB parts;
  - `.github/workflows/deploy.yml` deploys on every push to `main` once the two secrets exist (until then it skips itself);
  - `docs/DEPLOY.md` lists every step that needs the owner's Cloudflare login;
  - `pnpm --dir web demo:record` records the README screenshots and the demo video.

### Key concepts

- **One origin behind one door**: the site and its data are on the same address, and Cloudflare Access checks every request (pages and tile ranges) before anything runs. Without a custom domain, a bucket's public address could not be protected, so the data goes through the site.
- **A Function as a small file server**: it reads the object from R2 with the request's Range header and answers with exactly the bytes asked for, plus the headers the loader needs (`206`, `Content-Range`). The logic is a pure function, so it is tested without Cloudflare.
- **Static vs dynamic requests**: the app's files are free static assets; only `/r2/*` costs a Function request (100,000 a day on the free plan). `_routes.json` draws that line.
- **Versioned data**: everything lives under `v1/`. New data goes to `v2/`; visitors' saved review changes belong to a version and never mix with other data.
- **Secrets stay outside**: the repo has the build settings (all public anyway) but no token. The owner puts tokens into rclone, the wrangler login and GitHub secrets.

### Why this way

[ADR 0015](adr/0015-demo-hosting-cloudflare.md) (accepted; the demo stays NORA only, no upload): Pages + private R2 through a Function, behind Access; deploy by CI, data by hand.

### Quiz

1. A visitor's browser asks for `/r2/v1/potree/nora/octree.bin` with `Range: bytes=1000-1999`. Follow the request: what checks it, what runs, and what comes back (status and headers)?
2. Why could the tiles not simply stay in a public R2 bucket, as the PRD first planned, once only invited people should see the demo?
3. You upload a corrected `instances.json`. Why should it go under `v2/`, and what happens to the review changes a visitor made on `v1`?

## T10 · Sharper points (added by the owner after T9)

### What was built

- The viewer now streams finer detail and draws round points ([ADR 0016](adr/0016-point-detail-and-shape.md)).
- The settings are in `web/src/viewer/pointStyle.ts`:
  - `minNodePixelSize` 50, where the loader's default is 200;
  - circular, adaptive points.
- A unit test checks the settings. A Playwright test checks them on the real loaded cloud.
- [docs/spikes/T10-point-detail.md](spikes/T10-point-detail.md) has the comparison images and numbers.

### Key concepts

- **Level of detail (LOD) in an octree:**
  - The tiles form a tree. The root holds a thin sample of the whole scan, and each child holds more points for a smaller box.
  - The loader walks the tree from the root. For each child tile it projects the child's bounding sphere on the screen and fetches the child only if the projected radius is at least `minNodePixelSize` device pixels (half the canvas height × the pixel ratio goes into that projection). It stops when it reaches the point budget.
- **Why the demo looked blurry:**
  - With the loader's default of 200 px, a view of the whole plant never refined past the root.
  - That gave 13k points out of a 3M budget.
  - Large square points then covered the gaps.
- **Detail costs download, not frame rate:**
  - Every setting held 144 Hz on the M3.
  - What grows is the tile data per view and, on the demo, the number of Function requests.
- **Pixel ratio matters:** the loader measures tiles in screen pixels, so a 1× external monitor gets less detail than a 2× Retina screen at the same threshold.

### Why this way

[ADR 0016](adr/0016-point-detail-and-shape.md) (accepted): 50 px gives 10 to 16 times the points in far views. In the spike's two zoomed views that costs 22–29 MB of tiles and 180–250 requests per view; the opening whole-plant view is 26 tiles, about 4.4 MB. That still fits the free plan for invited reviewers. 30 px would download 50+ MB per zoomed view. Circles cost nothing extra.

### Quiz

1. The point budget is 3 million, yet the whole-plant view drew only 13,105 points before this change. What stopped the loader from loading more?
2. If you lowered `minNodePixelSize` from 50 to 30, what would change for a demo visitor? Name the frame rate, the download, and the Cloudflare free plan.
3. Why does the same setting give fewer points on a 1× external monitor than on a Retina screen?

### Follow-up: point size 1.5

- **What changed:** points are drawn 1.5 times the loader's base size (`POINT_STYLE.size`), recorded as an amendment to [ADR 0016](adr/0016-point-detail-and-shape.md).
- **Why:**
  - After the change went live, near gray beams and the floor showed white specks.
  - Round points cannot tile a surface: four circles leave a gap that a square would cover.
  - Light gray points in front of a white background make those gaps easy to see, and the 13 % sample makes them larger up close.
  - Size 1.5 closes most gaps; size 2 starts to merge valves and thin pipes.
  - The shader draws a point at `max(minSize, size × base)`. Far away the base is under the 2 px minimum, so a bigger `size` changes nothing there; up close it scales the points.
- **What it was not:** memory or performance. The close-up reached the 3M point budget and still drew at 144 fps.

#### Quiz

1. Why did switching from square to round points create white specks on near surfaces?
2. Why does making points bigger help up close but not change the whole-plant view?
3. The close-up drew 2,996,334 points. Which setting capped that number, and what would happen if it were raised?

---

## Docs · Three different point counts

### What was built

Wording only. The header, the About panel and the README now name which count is which.

- The header shows `scan.point_count` from the pipeline (151,901,442 for NORA) as source points.
- The demo tiles are a separate count: a 13 % random sample, about 20M points. Local full mode serves the full scan.
- `POINT_BUDGET` (3 million) is the upper bound on points the loader selects for a view. `minNodePixelSize` often stops the walk before that bound.

### Key concepts

- **Source points, tile points, selected points.** The source scan, the tiles on disk, and the points chosen for the current view are three counts. Hiding structure and floor does not remove those points from the budget: the loader still selected them, and the shader discards them.
- **A frame interval is the time between presentations.** With vsync, `requestAnimationFrame` runs once per display refresh. 6.9 ms on that 144 Hz display means the view kept up. A frame that finishes early still waits, so the interval is not GPU time and does not show spare capacity.

### Why this way

The octree, the budget and the measurement were already recorded. The sentences a reader meets first now use the same words as the code: source points, point budget, frame interval.

### Quiz

1. The header shows 151.9M. Which of the three counts is that, and what does `POINT_BUDGET` limit?
2. Which of octree streaming, the point budget and the GPU pick come from `@pnext/three-loader`, and which parts does this repository add?
3. The performance table says 6.9 ms. What clock produced that number?

---

## Docs · The architecture pictures

### What was built

[docs/ARCHITECTURE.md](ARCHITECTURE.md) and three pictures in [docs/diagrams/](diagrams/): the two runtimes, what a view loads, and what a review writes. Each picture has a `.excalidraw` file and an `.svg`. `node docs/diagrams/build.mjs` writes both from one description.

### Key concepts

- **A runtime reads files.** The 3.25 GB scan is handled offline, in chunks. Postgres is seeded with the inventory and then stores review events. The point tiles are never rows.
- **One origin locally, no server on the demo.** nginx is the only host the browser talks to, so there is no CORS. The demo cannot use that stack: Pages cannot hold `octree.bin`, and a public bucket would skip Access, so a Function reads a private bucket.
- **One interface, two stores for the same event.** The panels call `ScanDataSource`. The API appends `review_event` in the same transaction as the change. The demo appends that shape in the browser and replays it.

### Why this way

The pictures match the code a reader will open: `VITE_DATA_MODE`, `POINT_BUDGET`, `minNodePixelSize`, and `ScanDataSource`. The options that were turned down stay in the ADRs. The README links the page so the first screen is the split, and the reasons sit next to the pictures. [ADR 0017](adr/0017-architecture-diagrams.md) records why one script writes both the Excalidraw file and the SVG.

### Quiz

1. Why does local full mode serve the app, the API and the tiles from one nginx, and what would three ports have required?
2. Why is the demo's R2 bucket private, and which process is allowed to read it?
3. A reviewer corrects a class. Which store changes in local mode, which store changes in the demo, and which file does not change in either?

## Docs · The limits, as mechanisms

Four limits are easier to explain as mechanisms than as missing features.

- **The point budget is one measured constant.** `POINT_BUDGET` caps how many points the loader may select for a view. `minNodePixelSize` often stops the walk earlier, so a far view never reaches the cap. A second cap, for another GPU, would be a second constant plus a new measurement on that machine. The M3 run is the only recorded one.
- **A selected object is a box, not a set of recoloured points.** The box comes from the object's `bbox_min` and `bbox_max` in the inventory, so it is on screen even when that object's tiles have not loaded. Colouring the object's own points means testing each loaded point's instance id in the shader. [ADR 0005](adr/0005-potree-loader-and-picking.md) records why that shader path was left unused: the loader's instance-colour attribute is named differently from the attribute in the tiles, and the MVP selects with a box.
- **A class correction and a point's colour are different records.** The colour in 3D is the classification stored in the tiles when PotreeConverter ran. The correction is a review event, applied when the inventory is read. The table and the detail panel follow the event. The tiles stay as they were. Showing the new class on the points means a shader override for those instance ids, or building the tiles again.
- **A review event has one actor.** In the API that actor is the string `"local user"`. In the demo the same events sit in the browser that made them. Closing an issue that is already closed returns 409, so the log rejects a repeated close. Two people editing one object needs an identity on the event and a rule for two open edits. The event has the first, only as that fixed string. It does not have the second.

#### Quiz

1. The whole-plant view selects about 300k points while `POINT_BUDGET` is 3 million. What stopped the loader, and what would a budget for a different GPU require?
2. You select a valve whose fine tiles have not arrived yet. Why is its box still drawn, and what would have to change to colour that valve's points instead?
3. You correct a pipe's class. Which stored record changes, which one does not, and why can two reviewers not both be represented on one event today?
