# scan-inventory · MVP Product Requirements Document

Version 1.2 (draft) · 2026-11-09 · Owner: Shueny Wang
Changes in 1.1: public online demo added (static hosting, review state in the browser), data source adapter, summary and export moved to the client, new task T9.
Changes in 1.2 (draft, waiting for the owner): Kubernetes manifests for local full mode on a local cluster (section 6.3, task T11, ADR 0017). Helm, a cloud cluster and the public demo hosting stay as they are.

This document is the single source of truth for building the scan-inventory MVP with Claude Code. Read it fully before writing code. When this document and your own judgement disagree, stop and ask the owner.

---

## 0. How to work on this project (rules for Claude Code)

The owner will be interviewed about every decision in this project. Code she cannot explain is worse than no code. These rules exist for that reason.

1. **Work ticket by ticket.** Do the tasks in section 9 in order. One task per branch and per PR-sized change. Do not start the next task until the owner confirms the current one.
2. **Decisions belong to the owner.** When a task has a real choice (library, data model, algorithm, folder structure not specified here), present 2 or 3 options with trade-offs and a recommendation, then wait. Do not pick silently.
3. **Write an ADR for every decision** in `docs/adr/NNNN-title.md` (context, options, decision, consequences). Short is fine.
4. **Explain after each task.** Append to `docs/LEARNING.md`: what was built, the key concepts in plain language, why it was done this way, and 3 quiz questions the owner should be able to answer. Keep explanations simple and concrete.
5. **No silent scope growth.** If you see a useful addition, propose it in your reply. Do not add it.
6. **Never commit data.** `pointcloud/`, `meta/` raw files, `data/potree/` and any `*.ply`, `*.e57`, `*.las`, `*.laz` stay out of git.
7. **Quality gate before declaring a task done:** all tests pass, type checks pass, lint passes. Paste the command output in your reply.
8. **Keep memory low.** The source point cloud is 3.25 GB with 151.9 million points. Any Python that touches it must read in chunks (the existing scripts show the pattern). Never load the whole file into RAM.

---

## 1. Product summary

**What it is.** A web platform that turns an annotated laser scan of an industrial plant into a reviewable object inventory. The user sees the scan in 3D, gets a list of detected objects (valves, flanges, pipes, instruments) grouped by zone and system, linked to the P&ID tag list, and works through a review queue of suspicious results.

**Why it exists.** Portfolio project for a Software Architect / web platform role at a company that builds AI for 3D scans of industrial facilities. It must show three things:
1. Handling large point clouds in the browser (streaming, level of detail).
2. A product workflow around AI results: present, verify, correct, report.
3. Sound architecture: clear data pipeline, typed API, persistence, containerised services.

**Two ways to run it, one codebase.**

| | Local full mode | Public demo mode |
|---|---|---|
| who uses it | the owner, live in an interview | anyone with the link, before an interview |
| point cloud | full 151.9M points | sampled to about 20M points |
| review state | FastAPI + PostgreSQL | stored only in the visitor's browser |
| hosting | `docker compose up` on a laptop | static site + object storage, no server |

The UI is identical in both modes. Only the data source behind it changes (section 6.1). This is a deliberate architecture point to show in interviews.

**Framing.** The dataset's human annotations stand in for "AI detections". Rule-based checks generate the review queue. The UI and README must say this openly. We do not claim to have trained a model.

---

## 2. Target user and core job

**Primary user: plant planning engineer** (maintenance or decommissioning planning).

Their questions:
- What equipment is in this facility, how many of each, and where?
- Which items match the P&ID, and which do not?
- How much piping is there per zone (rough quantity for budgeting)?
- Which detections can I trust, and which do I need to check?

**Core job for the MVP:** "Open the scan, see the inventory, find and resolve the questionable items, export the confirmed list."

---

## 3. The 2-minute demo (MVP acceptance story)

The MVP is done when this script works end to end on the owner's MacBook:

1. Run `docker compose up` and open the web app.
2. The scan loads progressively and is coloured by object class. Structural and floor can be hidden with one toggle.
3. The left panel shows zones (NW, NC, NE, SW, SC, SE, SW-SE) and classes with counts. Unticking a zone hides its objects from the list and dims them in 3D.
4. The user clicks a valve in 3D. The camera focuses on it, its bounding box is highlighted, and the right panel shows class, P&ID tag, element type, nominal size, system, zone, point count and size.
5. The user clicks a row in the inventory table. The camera flies to that object.
6. The user opens the review queue. It lists issues sorted by severity, for example "P&ID says safety valve, annotation says piping component".
7. The user resolves an issue: accepts, rejects, or changes the class, with an optional note. The change is saved, appears in the object history, and survives a page reload.
8. The dashboard shows counts per zone and class, and estimated pipe length per zone with a clear "estimate" label.
9. The user exports the inventory as CSV, including review status.

The same script must also work on the **public demo URL** in a desktop browser, with these differences: the scan is the sampled version, a banner says "Demo mode: your review changes are saved only in this browser", and a "Reset demo" button clears them. A visitor with no setup should see the first points within about 5 seconds on a normal connection.

---

## 4. Scope

### In scope (MVP)
- Offline data pipeline in Python (inventory, issues, LAS export).
- Potree conversion for streaming in the browser.
- Web viewer: progressive loading, class colours, visibility filters, object picking, fly-to, bounding box highlight.
- Inventory panel: filters by zone, system, class, review status; sortable table; object detail panel.
- Review queue with persisted decisions and an audit history.
- Dashboard with counts and estimated pipe length.
- CSV export.
- Docker Compose for API, database and static data.
- Kubernetes manifests (Kustomize) for local full mode on a local kind cluster (section 6.3, T11).
- Public demo build: static frontend, sampled Potree tiles in object storage, browser-only review state.
- Tests and a README with architecture diagram, live demo link and dataset credit.

### Out of scope (later)
- User accounts, auth, multi-user collaboration.
- Uploading new scans, background job queue, chunked upload.
- Helm, a managed cloud cluster, autoscaling, offline (air-gapped) installer. (Plain Kubernetes manifests for a local cluster are in scope since 1.2, section 6.3.)
- Own detection algorithm (RANSAC cylinder fitting), accuracy metrics.
- P&ID PDF viewer, RAG question answering.
- Point-level editing (re-assigning points between objects).
- Hosting the API and database publicly. The public demo has no backend.
- Mobile support. On small screens show a short notice and the demo video link.

Keep these in mind when designing (for example, do not hard-code a single scan id into every table), but do not build them.

---

## 5. Data reference

All facts below were measured on the real data. Do not assume other values.

### 5.1 Source files (in the repo root, not committed)

```
pointcloud/nora.ply        3.25 GB, binary little endian, 151,901,442 points
pointcloud/raw.e57         raw FARO scans (not used in MVP)
meta/classes.json          class id -> class name
meta/pnid_composition.csv  P&ID tag list
meta/annotation_guidelines.txt
project/cad.obj            design CAD model (not used in MVP)
project/pnid_1_rpc.pdf, project/pnid_2_sp.pdf  (not used in MVP)
```

### 5.2 nora.ply fields

| field | type | meaning |
|---|---|---|
| x, y, z | float32 | metres. x -3.49 to 12.67, y -0.89 to 8.84, z 36.44 to 41.83 |
| red, green, blue | uint8 | scan colour |
| scalar_label | float32 | class id, integer values stored as float |
| scalar_instance | float32 | instance id, integer values stored as float |

Coordinates are small, so no origin offset is needed for float32 precision. **Z is up.** The floor is at about z = 36.8.

### 5.3 Classes (classes.json)

0 Structural, 1 Manual wheel valve, 2 Manual lever valve, 3 Pressure meter, 4 Transmitter, 7 Floor, 8 Pipe, 9 Control valve, 10 Automated on/off valve, 11 Check valve, 12 Pressure safety valve, 13 Motor, 14 Strainer/Filter, 17 Tank/Vessel, 20 Piping components, 22 Small manual valve, 23 Pipeline flanged joint.

Background classes: 0 Structural (1 object, 57.3M points) and 7 Floor (2 objects, 55.2M points). Together they are about 74% of all points.

### 5.4 P&ID tag list (pnid_composition.csv)

Columns: `TAG, TAG Simplified, Element, Dimension, Spool colour, Location, System, Instance ID`.
- 102 rows. `Dimension` is a nominal size like `2 1/2"`. `Location` is a zone. `System` is like `RWP - 109`.
- `Instance ID` can be empty (tag not found in scan) or hold several ids (`"177,175"`).
- Some cells have trailing spaces (`"butterfly valve "`). Trim everything.

### 5.5 Existing pipeline output (data/instances.json, data/instances.csv)

Produced by `scripts/build_instances.py` (already written, see task T1). 263 instances. Per instance: class, point count, centroid, axis-aligned bounding box, principal axis, PCA-based `length_est_m` and `diameter_est_m`, mean colour, P&ID tag fields, zone and `location_source` (`pnid`, `nearest_tag`, `background`).

Summary: 85 pipes (estimated total length about 110 m), 69 flanged joints, 18 wheel valves, 28 lever valves, 9 check valves, 9 pressure meters, 6 control valves, 5 transmitters, 5 small manual valves, 4 motors, 4 strainers, 14 piping components, 2 tanks, 1 automated valve, 1 safety valve, plus background.

### 5.6 Known data issues (these become the review queue)

These are real and must be detected by rules, not hard-coded:

1. **Class mismatch with P&ID.** Instance 1 is tagged PSV-103A (safety valve) but annotated as Piping components. Instance 169 is tagged VBT-109C (1/2" ball valve) but annotated as Pipe with 1.24 m estimated length.
2. **P&ID tags with no object:** PT-101A1, PCV-104A, PT-108A, PT-108B, PT-108C, PT-106A.
3. **Objects that need a tag but have none:** transmitters 2, 14, 17, 18; pressure meters 6, 10; motors 165, 166; small manual valve 206.
4. **One tag, several objects:** P-109A -> 175 (Motor) and 177 (Piping components); P-109B -> 176 and 178.
5. **Unreliable pipe estimate:** 24 of 85 pipes have `diameter_est_m` > 0.3, which means the pipe is bent or branched and the PCA length is not trustworthy.
6. **Borrowed zone for a tagged object:** PVE-103 (13) and SEP-101 (46) have a tag but no zone in the P&ID, so their zone came from the nearest tag.
7. **Cross-zone value:** some P&ID rows use `SW - SE`. Keep it as its own zone value in the MVP.

### 5.7 Licence

NORA dataset, SENAI ISI-SIM, CC BY 4.0, doi:10.5281/zenodo.21775624. Show this credit in the app footer and the README.

---

## 6. Architecture

```
            OFFLINE (Python, run once)                         RUNTIME (docker compose)
 ┌───────────────────────────────────────────┐     ┌──────────────────────────────────────────┐
 │ pointcloud/nora.ply ─┐                     │     │  web (Vite build, served by nginx)        │
 │ meta/*.json,csv ─────┼─> build_instances ──┼──┐  │   React + TS + Three.js + Potree loader   │
 │                      │   -> instances.json │  │  │   reads /potree/* (static, Range requests)│
 │                      ├─> build_issues      │  │  │   calls /api/*                            │
 │                      │   -> issues.json    │  │  └───────────────┬──────────────────────────┘
 │                      └─> export_las        │  │                  │ HTTP JSON
 │                          -> nora.las        │  │  ┌───────────────▼──────────────────────────┐
 │                             │               │  └─>│  api (FastAPI)                            │
 │                  PotreeConverter 2         │     │   seeds DB from instances.json/issues.json │
 │                             ▼               │     │   review decisions, history, export        │
 │                    data/potree/nora/        │     └───────────────┬──────────────────────────┘
 └───────────────────────────────────────────┘                     │
                                                    ┌───────────────▼──────────────────────────┐
                                                    │  db (PostgreSQL)                          │
                                                    └──────────────────────────────────────────┘
```

Principles:
- **Heavy work offline, light work at runtime.** The 3.25 GB file is processed once. The runtime only serves pre-built tiles and small JSON.
- **Static data is static.** Potree tiles are served by nginx as files with HTTP Range support. The API never streams point data.
- **The database holds only what users change** (review decisions and history) plus the seeded inventory. Point data never goes into Postgres.
- **One shared contract.** The API publishes an OpenAPI schema. The frontend generates its TypeScript types from it, so frontend and backend cannot drift.

### 6.1 Data source adapter (frontend)

All data access in the frontend goes through one TypeScript interface. Components and hooks never call `fetch` directly.

```ts
interface ScanDataSource {
  getScan(scanId: string): Promise<ScanMeta>;
  listInstances(scanId: string): Promise<Instance[]>;      // all 263, filtered client-side
  getInstance(scanId: string, id: number): Promise<InstanceDetail>; // incl. history
  updateInstance(scanId: string, id: number, change: InstanceChange): Promise<InstanceDetail>;
  listIssues(scanId: string): Promise<Issue[]>;
  resolveIssue(scanId: string, issueId: string, resolution: Resolution): Promise<ResolveResult>;
  resetDemo?(): Promise<void>;                               // demo only
}
```

Two implementations:

- **`ApiDataSource`** (local full mode): calls the FastAPI endpoints in 8.2.
- **`StaticDataSource`** (public demo mode): loads `instances.json` and `issues.json` as static files, keeps an append-only list of review events in the browser, and replays them on top of the static data to get the current state. Same event shape as the API's `review_event` table.

Mode is chosen at build time with `VITE_DATA_MODE=api|static`. Both implementations must pass the same contract test suite (one shared set of Vitest tests run against both, the API one against a running test server or a mock of it, propose which).

Because the instance list is small (263 rows), **filtering, the dashboard summary and CSV export are computed in the frontend** from the instance list in both modes. One implementation, in `web/src/domain/`, with unit tests. The API therefore does not need summary or export endpoints.

### 6.2 Public demo deployment

```
 visitor's browser
   │  HTML/JS/CSS + instances.json + issues.json        Range requests for tiles
   ▼                                                     ▼
 Static site host (Cloudflare Pages)          Object storage (Cloudflare R2, public read)
   web/dist (VITE_DATA_MODE=static)             potree/nora-demo/metadata.json
                                                 potree/nora-demo/hierarchy.bin
                                                 potree/nora-demo/octree.bin
```

- Potree 2.0 output is three files, and `octree.bin` is one large file. Static site hosts have per-file size limits (Cloudflare Pages: 25 MB), so tiles go to R2, not into the site.
- R2 bucket: public read-only, CORS allows `GET` and `HEAD` from the demo origin, allows the `Range` request header and exposes `Content-Range`, `Content-Length`, `Accept-Ranges`. Verify with a curl Range request.
- Long cache headers on tiles (they are immutable; put a version in the path, e.g. `nora-demo/v1/`).
- No secrets in the frontend. Deployment credentials live only in the CI or the owner's machine.
- Recommended hosts: Cloudflare Pages + R2 (one account, R2 free tier has no egress fees). Alternative: GitHub Pages for the site, still R2 for tiles. The owner decides in T9.

---

### 6.3 Kubernetes (local full mode on a local cluster)

Goal: show that the local full mode (section 6) runs on Kubernetes, and what has to change to get there. It is a teaching and interview piece, not a production deployment. The public demo stays on Cloudflare (ADR 0015) and nothing is hosted publicly.

```
 browser ── localhost:8088 ──> Service web (nginx: app, /api proxy, /potree tiles)
                                  │ /api
                                  ▼
                               Service api ──> Deployment api (uvicorn only, 2 replicas)
                                  │
                                  ▼
                               Service db  ──> StatefulSet postgres + PersistentVolumeClaim
 Job migrate-seed (alembic upgrade head + app.seed), run once per deploy, before the api rolls
 data/ (tiles + JSON) mounted read-only from the host into the kind node
```

Requirements:
- Same images as docker compose. Compose behaviour does not change.
- Schema migration and seeding run once per deploy in a Job, never in every API pod (several pods would race; ADR 0009 named this risk).
- Readiness and liveness probes on `GET /api/health`. Resource requests and limits on every container, set from measured use.
- Database credentials in a Secret created from `.env`, never committed. Non-secret settings in a ConfigMap.
- Data stays out of git and out of images (rule 6): tiles and JSON are mounted from the host's `data/`.
- One command to bring it up and one to tear it down, documented in the README.

## 7. Tech stack

Fixed choices (do not change without asking):

| area | choice | note |
|---|---|---|
| pipeline | Python 3.11+, numpy, plyfile, laspy | chunked processing |
| tiling | PotreeConverter 2.x | output format Potree 2.0 |
| frontend | React 18, TypeScript (strict), Vite | owner's main stack |
| 3D | Three.js + a Potree 2.0 loader for Three.js | loader is chosen in spike T2 |
| state | Zustand (UI state), TanStack Query (server state) | owner uses both |
| styling | Tailwind CSS | own design, see 8.6 |
| charts | Recharts | |
| API | FastAPI, Pydantic v2, SQLAlchemy 2, Alembic | |
| DB | PostgreSQL 16 | |
| types | openapi-typescript to generate TS types | |
| tests | pytest, Vitest, React Testing Library | Playwright only for one smoke test |
| tooling | ruff, mypy (pipeline + api), eslint, prettier, pre-commit | |
| run | Docker Compose | |

Open choice for spike T2: which Potree 2.0 loader package (for example `potree-core` or an alternative). Verify against the real converted data before choosing.

---

## 8. Functional requirements

### 8.1 Pipeline (Python, `scripts/`)

**P1 build_instances.py** (exists). Required changes in T1:
- Add `has_tag` / keep `location_source` honest: when a tag exists but its zone was borrowed, use `location_source = "nearest_tag_tagged"` (or similar, propose a name) instead of plain `nearest_tag`.
- Store all tags per instance, not only the first one (already in `all_tags`, also expose the primary tag clearly).
- Add a `scan_id` field (value `nora`) to every record.
- Keep output schema documented in `docs/data-schema.md`.

**P2 build_issues.py** (new). Reads `instances.json` and the P&ID CSV, writes `data/issues.json`. Each issue:

```json
{
  "issue_id": "class_mismatch:1",
  "type": "class_mismatch",
  "severity": "high",
  "instance_ids": [1],
  "tags": ["PSV-103A"],
  "title": "P&ID says safety valve, annotation says Piping components",
  "detail": "...",
  "suggested_action": "change_class",
  "suggested_class_id": 12
}
```

Rules (each one is a small pure function with its own unit test):

| type | rule | severity |
|---|---|---|
| `class_mismatch` | P&ID element type does not fit the annotated class. Use an explicit mapping table element -> allowed class ids (e.g. `safety valve` -> {12}, `ball valve` -> {2, 22}, `indicator` -> {3}). Unmapped element types are skipped and logged. | high |
| `tag_missing_in_scan` | P&ID row with no instance id | medium |
| `untagged_equipment` | non-background, non-pipe, non-flange object without a tag | medium |
| `tag_split` | one tag maps to more than one instance | low |
| `estimate_unreliable` | pipe with `diameter_est_m` > 0.3 | low |
| `zone_borrowed` | tagged object whose zone came from the nearest tag | low |

For `untagged_equipment` of class Transmitter, also add a `candidate_tags` list: P&ID tags with element `transmitter` and no instance, ranked by distance to the nearest object that shares their system. This is a suggestion only, the user decides.

The mapping table lives in `scripts/class_mapping.py` and is reviewed by the owner before use.

**P3 export_las.py** (new). Streams nora.ply into a LAS 1.4 file in chunks:
- point format 7 (xyz + rgb, 16-bit colour, scale uint8 x 257).
- `classification` = class id (uint8, all ids are < 256).
- **instance id goes into `point_source_id`** (uint16, standard field, no extra bytes needed). Verify in T2 that PotreeConverter keeps it.
- `--sample` option for the public demo build, target about 20M points (fraction about 0.13). Default: all points. Sampling must be deterministic (fixed seed). In T2, compare plain random sampling with voxel-grid sampling on screenshots and file size, and let the owner choose. Check that small objects (the smallest has 1,100 points) are still visible and pickable after sampling.
- Scale 0.0001 m, offset at the bounding-box minimum.

**P4 convert script.** `scripts/build_potree.sh` runs PotreeConverter on the LAS and writes to `data/potree/nora/`. Document in README how to install PotreeConverter on macOS (Apple Silicon). If building it is a problem, stop and report with options.

### 8.2 API (FastAPI, `api/`)

Data model (propose the exact SQLAlchemy models in T5, these are the minimum):

- `scan` (id, name, source, licence)
- `instance` (scan_id, instance_id, class_id, class_name, is_background, point_count, centroid, bbox_min, bbox_max, tag, all_tags, element, nominal_inch, system, zone, location_source, length_est_m, diameter_est_m, review_status, current_class_id). Primary key (scan_id, instance_id).
- `issue` (scan_id, issue_id, type, severity, instance_ids, tags, title, detail, suggested_action, suggested_class_id, candidate_tags, status: open | resolved | dismissed)
- `review_event` (id, scan_id, instance_id, issue_id nullable, action, from_value, to_value, note, created_at). Append-only. This is the audit history.

`review_status` per instance: `unreviewed` | `confirmed` | `corrected` | `rejected`.

Seeding: on startup (or via a CLI command), load `instances.json` and `issues.json` if the scan is not in the DB yet. Seeding must be idempotent.

Endpoints (prefix `/api`):

| method | path | purpose |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/scans/{scan_id}` | scan meta, class list with colours, zone list, licence |
| GET | `/scans/{scan_id}/instances` | list with filters: `zone`, `system`, `class_id`, `review_status`, `q` (tag search), `include_background` |
| GET | `/scans/{scan_id}/instances/{id}` | detail incl. history |
| PATCH | `/scans/{scan_id}/instances/{id}` | change `review_status` and/or `current_class_id`, with `note`. Writes a `review_event`. |
| GET | `/scans/{scan_id}/issues` | filters: `status`, `severity`, `type`. Sorted high -> low severity. |
| POST | `/scans/{scan_id}/issues/{issue_id}/resolve` | body: `action` (accept_suggestion, change_class, assign_tag, dismiss), optional `class_id`, `tag`, `note`. Updates issue + instance, writes events in one transaction. |

Summary and CSV export are computed in the frontend (section 6.1), not by the API.

Requirements:
- Pydantic models for every request and response. OpenAPI must be complete enough to generate frontend types.
- Validation errors return 422 with clear messages. Unknown ids return 404.
- Resolve and PATCH are transactional. A failure writes nothing.
- CORS only for the local web origin.

### 8.3 Viewer (frontend)

- Load Potree tiles from `/potree/nora/` with progressive level of detail. Set a point budget (start at 3M points, make it a constant).
- Camera: orbit controls, Z-up. Initial view frames the whole facility.
- Colour modes: **class** (default) and **RGB**. Class colours come from the API scan meta, so list and 3D use the same colours.
- Visibility: toggle background (Structural + Floor) off by default for clarity is a decision for the owner in T3; propose it.
- Picking: click a point -> get its instance id -> select that instance. Method is decided in T2 (Potree pick reading `point_source_id`, or fallback ray test against the 263 bounding boxes from the API, smallest box wins).
- Selection: draw the instance's bounding box as a wireframe, fly the camera to it (smooth, under 1 s), sync with the panels.
- Zone filter: objects outside the active zones are dimmed or hidden. If per-instance filtering in the shader is too costly for the MVP, filter only the list and the bounding boxes, and say so in the ADR.
- Performance target on the owner's MacBook Air: interactive frame rate (aim for 30 fps or better) while orbiting at the default point budget. Measure and write the result in `docs/LEARNING.md`.

### 8.4 Inventory and detail panels

- Left panel: zone checkboxes with counts, system filter, class list with colour swatch and counts, review status filter, tag search.
- Table: tag, class, element, size, zone, system, review status. Sortable. Click row = select + fly-to. Background rows hidden unless toggled.
- Right panel (detail): all fields from section 8.2 `instance`, size from the bounding box, estimated length and diameter marked "estimate (PCA)" with a tooltip explaining it, review actions (confirm, reject, change class with dropdown, note), and the history list.
- Selection state lives in one Zustand store shared by viewer, table and panels.

### 8.5 Review queue and dashboard

- Review queue view: list of open issues, grouped or sortable by severity and type. Selecting an issue selects its first instance in 3D. Each issue type shows the right actions (for `untagged_equipment` with candidates: "assign tag" with the candidate list).
- Resolved issues move to a "resolved" tab with who/when/what (who = "local user" in MVP).
- Dashboard: bar chart of objects per zone, stacked or grouped by class family (valves, instruments, piping, equipment); table of pipe length per zone with the unreliable share shown; review progress (reviewed / total, open issues by severity).
- Export button builds the CSV in the browser from the current instance list (both modes).
- Summary numbers: counts per zone x class, pipe length per zone (sum of `length_est_m` plus the share flagged unreliable), review progress. Computed in `web/src/domain/summary.ts`.

### 8.7 Public demo mode

- Banner at the top: "Demo mode: your review changes are saved only in this browser." with a "Reset demo" button (asks for confirmation).
- Review events are stored in browser storage under a versioned key (e.g. `scan-inventory:nora:v1:events`). Every read and write is wrapped in try/catch. If storage is not available (private window, blocked), the app still works and keeps changes in memory for the session, and the banner says so.
- If the static data version changes, old stored events for another version are ignored, not applied.
- Loading screen with progress while the first tiles arrive. If WebGL 2 is not available, show a short message, a screenshot and the demo video link instead of a blank page.
- Small screens (under 1024 px wide): notice that the demo is built for desktop, with the video link, and an option to continue anyway.
- An "About" panel: what the project is, the honest framing (annotations stand in for AI detections), the architecture in one diagram, link to the GitHub repo, dataset credit.

### 8.6 UI and design

- Own visual design. Do not copy the layout or styling of any existing commercial point-cloud product. A three-column layout (filters, 3D, details) is fine because it is the natural structure.
- Clean, technical, calm. Light theme first. Readable at 1440 px and usable at 1280 px. Mobile is out of scope.
- All units in metres, sizes in inches only where the P&ID gives inches, labelled.
- Footer: dataset credit (section 5.7).

---

## 9. Tasks (do them in this order)

Each task ends with: tests green, `docs/LEARNING.md` updated, ADRs written for decisions, and a short report to the owner.

**T0 · Repo scaffold**
`scripts/`, `api/`, `web/`, `docs/adr/`, `data/` (gitignored except `.gitkeep`), `docker-compose.yml`, `.gitignore`, pre-commit config, `CLAUDE.md` that points to this PRD and repeats section 0.
Done when: `pre-commit run --all-files` passes on the empty skeleton.

**T1 · Pipeline: instances + issues**
Move existing `build_instances.py` into `scripts/`, apply P1 changes, write `build_issues.py` and `class_mapping.py`. Unit tests use small synthetic fixtures, never the real 3.25 GB file.
Done when: running on the real data produces issues covering every item in 5.6, and the owner has reviewed the class mapping table.

**T2 · Spike: LAS export, PotreeConverter, loader (decision gate)**
Write `export_las.py`, convert a 5% sample first, then the full file. Build a throwaway page that loads the tiles with the candidate loader.
Answer in a written report: (a) does `point_source_id` survive conversion, (b) can the loader read classification and point_source_id at a picked point, (c) can it colour by classification, (d) tile size on disk and load time, (e) recommended loader and picking method.
Stop and wait for the owner's decision. Delete the throwaway page afterwards.

**T3 · Viewer**
Vite app with the chosen loader, camera, colour modes, background toggle, picking, selection box, fly-to. Set up the `ScanDataSource` interface (section 6.1) now and implement `StaticDataSource` first, read-only, so the viewer never depends on the API being up. The tile base URL comes from an env variable (`VITE_TILES_BASE_URL`).
Done when: demo steps 2 and 4 work (with dummy detail data if the API is not ready).

**T4 · API + DB**
FastAPI, models, Alembic migration, seeding, all endpoints in 8.2, Docker Compose with `api`, `db`, and a static server for `data/potree`.
Done when: pytest covers each endpoint including a failed transaction case, and `docker compose up` serves the API.

**T5 · Inventory and detail panels**
Generated TS types, `ApiDataSource`, write support in `StaticDataSource` (browser event log), TanStack Query hooks, filters, table, detail panel, review actions, history. Shared contract tests for both data sources.
Done when: demo steps 3, 4, 5 and 7 (single-object part) work in both modes.

**T6 · Review queue**
Issue list, resolve flows per type, resolved tab.
Done when: demo steps 6 and 7 work and every issue type from 5.6 can be resolved.

**T7 · Dashboard and export**
`domain/summary.ts` and `domain/exportCsv.ts` with unit tests, charts, export button.
Done when: demo steps 8 and 9 work in both modes.

**T8 · Polish and docs**
README (what it is, the honest framing from section 1, architecture diagram, how to run the pipeline and the app, dataset credit, known limitations), one Playwright smoke test of the demo path, recorded performance numbers.
Done when: a fresh clone plus the README steps reproduces the full demo.

**T9 · Public demo deployment**
Build the sampled tiles (`export_las.py --sample`, PotreeConverter), demo mode UI from 8.7, upload tiles to R2 under a versioned path, configure CORS and cache headers, deploy the static build, and a GitHub Actions workflow that builds and deploys the site on push to `main` (tiles are uploaded manually by a documented script, not by CI). Record a 90-second demo video and add it plus screenshots to the README.
Ask the owner before creating any cloud account resource, and give her the exact steps for anything that needs her login. Never put credentials in the repo.
Done when: the public URL runs the demo script from section 3 in Chrome and Firefox on desktop, a Range request to the tiles returns `206 Partial Content`, first points appear within about 5 seconds on a normal connection, and the README links to the live demo.

**T11 · Kubernetes manifests (added in 1.2, draft)**
Kustomize base plus a `kind` overlay under `infra/k8s/`, for the services in section 6.3, following the owner's decisions in ADR 0017. A kind cluster config that mounts `data/` and maps port 8088. A make target or script to create the cluster, load the images, create the Secret from `.env`, run the migrate-seed Job, deploy, and delete it all again. Render and validate the manifests in CI without a cluster.
Done when: on a fresh kind cluster the demo script from section 3 (steps 2 to 9) works at http://localhost:8088; the migrate-seed Job completes before the api pods become ready; deleting one api pod does not interrupt the app; a review decision survives deleting every api pod and the postgres pod; and `docker compose up` still works unchanged.

---

## 10. Non-functional requirements

- **Memory:** pipeline scripts stay under 2 GB RAM on the full file.
- **Reproducibility:** one documented command per pipeline step; outputs are deterministic for the same input (fix random seeds for sampling).
- **Security basics:** no secrets in the repo, DB credentials via `.env` (with `.env.example`), parameterised queries only (ORM), input validation on every endpoint, CORS restricted. Pin dependency versions.
- **Testability:** pure functions for issue rules and summary maths; API tests run against a test Postgres (compose service or testcontainers, propose one).
- **Observability (light):** API logs each review action with scan id, instance id and action.
- **Accessibility:** keyboard reachable panels and table, visible focus, colour is never the only signal for review status.
- **Public demo budget:** sampled tiles under 1 GB total, JS bundle under 1 MB gzipped (Three.js included), zero running server cost. Measure and record the real numbers.

---

## 11. Risks and open questions

| risk | impact | mitigation |
|---|---|---|
| PotreeConverter hard to build on Apple Silicon | blocks viewer | try release binary or Docker image first; fallback: convert inside a Linux container |
| Loader cannot read `point_source_id` or pick | no 3D picking by instance | bounding-box ray test fallback (263 boxes, cheap) |
| Per-instance highlight needs custom shader | effort | MVP uses bounding-box wireframe instead of point recolouring |
| Bent pipes make length estimates wrong | misleading numbers | always label as estimate, show unreliable share, issue type `estimate_unreliable` |
| Full-resolution tiles too large for laptop disk | slow iteration | build with `--sample` during development |
| R2 CORS or Range headers misconfigured | demo loads no points | verify with curl Range request and browser devtools before announcing the link |
| Two data sources drift apart | demo behaves differently from local | one shared contract test suite for both |
| Sampling removes small objects | some valves look empty in the demo | check smallest instances after sampling; voxel sampling or a minimum-points rule if needed |

Open questions for the owner (ask when the related task starts):
1. Background (Structural, Floor) hidden or visible by default? (T3)
2. Class families for the dashboard grouping. (T7)
3. Should `SW - SE` objects count in both zones in the dashboard, or stay separate? (T7)
4. Random or voxel sampling for the demo tiles? (T2)
5. Cloudflare Pages or GitHub Pages for the demo site, and which domain or subpath? (T9)
6. The Kubernetes choices in ADR 0017: target cluster, packaging, migration, database, data, entry point. (T11)

---

## 12. Definition of done (MVP)

- The 2-minute demo in section 3 runs from a fresh clone using only the README.
- All tasks T0 to T9 accepted by the owner.
- The public demo URL runs the demo script with no setup, and the README links to it.
- Tests, type checks and lint pass in one command (`make check` or equivalent).
- `docs/adr/` has an ADR for every real decision, and `docs/LEARNING.md` has an entry for every task.
- README states clearly that annotations stand in for AI detections and credits the NORA dataset.
