# One command for the quality gate (PRD section 12): `make check`.
.PHONY: install check check-scripts check-api check-web types e2e e2e-demo gate e2e-fixtures

install:
	cd scripts && uv sync
	cd api && uv sync
	pnpm --dir web install --frozen-lockfile
	pnpm --dir web exec playwright install chromium

check: check-scripts check-api check-web

check-scripts:
	cd scripts && uv run ruff check . && uv run ruff format --check . && uv run mypy . && uv run pytest -q

check-api:
	cd api && uv run ruff check . && uv run ruff format --check . && uv run mypy . && uv run pytest -q

check-web:
	pnpm --dir web typecheck && pnpm --dir web lint && pnpm --dir web format:check && pnpm --dir web test
	pnpm --dir web test:contract

# After an API change: export the OpenAPI schema and regenerate the frontend's types.
# Tests in api/ and web/ fail until both files are committed.
types:
	cd api && uv run python -m app.openapi > ../web/src/data/openapi.json
	pnpm --dir web types

# Playwright smoke test on the committed fixture plant (web/e2e/fixtures/data).
e2e:
	pnpm --dir web test:e2e

# The same smoke tests against the public demo stack (wrangler pages dev + local R2).
e2e-demo:
	pnpm --dir web test:e2e:demo

# The whole gate before a merge (docs/RUNBOOK.md); CI runs the same steps.
gate: check e2e e2e-demo
	uvx pre-commit run --all-files

# Rebuild the fixture plant for the smoke test (needs PotreeConverter).
e2e-fixtures:
	uv run --project scripts python scripts/build_e2e_fixtures.py
