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
