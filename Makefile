# One command for the quality gate (PRD section 12): `make check`.
.PHONY: install check check-scripts check-api check-web types

install:
	cd scripts && uv sync
	cd api && uv sync
	pnpm --dir web install --frozen-lockfile

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
