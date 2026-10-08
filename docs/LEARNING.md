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
