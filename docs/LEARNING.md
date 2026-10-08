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
