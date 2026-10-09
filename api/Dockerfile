# scan-inventory API image. Dependencies come from uv.lock, so the image matches tests.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.21 /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/app/.venv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY alembic.ini docker-entrypoint.sh ./
COPY migrations ./migrations
COPY app ./app

ENV PATH="/app/.venv/bin:$PATH" DATA_DIR=/data
RUN useradd --system --uid 10001 api
USER api
EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
