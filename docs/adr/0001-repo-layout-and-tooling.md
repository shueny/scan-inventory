# 0001 · Repo layout and tooling

Status: accepted · 2026-10-08 · Task T0

## Context

The PRD fixes the main stack (Python pipeline, FastAPI, React + Vite) but not the package managers, the Python version or how the three parts sit in one repository. These choices affect every later task, the Docker images and the one-command quality gate.

## Options

**Python tooling**
- uv: fast, one `pyproject.toml` plus `uv.lock` pins every version, can install Python itself.
- pip + requirements.txt: familiar, but no real lockfile, dev and runtime dependencies are awkward to separate.
- Poetry: mature with a lockfile, slower and heavier in Docker.

**Python version**
- 3.12: fully supported by laspy, SQLAlchemy 2, mypy and the official Docker images.
- 3.14: already installed locally, but newer than some wheels and tools.
- 3.11: the PRD minimum, oldest.

**JS package manager**: pnpm (installed, fast, strict lockfile) or npm (built in, slower).

**Layout**
- One repo, each part independent: `scripts/`, `api/`, `web/` each have their own config and lockfile; a root `Makefile` runs everything.
- uv workspace: `scripts` and `api` share one lockfile. Tidier, but one more concept to explain.

## Decision

uv, Python 3.12 (pinned in `.python-version`), pnpm, and one repo with independent parts plus a root `Makefile` (`make check`).

Pre-commit hooks for Python and web call the tools through `uv run` / `pnpm`, so the hook and `make check` use the same pinned versions instead of a second copy in `.pre-commit-config.yaml`.

TypeScript is pinned to 6.0.x because typescript-eslint 8 supports TypeScript `<6.1` (TypeScript 7 is out but not yet supported by the linter).

## Consequences

- `scripts` and `api` can drift in shared library versions (e.g. numpy). Acceptable: they do not import each other; the contract between them is the JSON files in `data/`.
- Each Docker image only installs its own part's dependencies.
- Contributors need `uv` and `pnpm` installed. Documented in README (T8).
