# One command for the quality gate (PRD section 12): `make check`.
.PHONY: install check check-scripts check-api check-web

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
