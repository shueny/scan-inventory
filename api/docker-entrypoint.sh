#!/bin/sh
# Start order: migrate the schema, seed the scan if it is new (idempotent), serve.
set -e
alembic upgrade head
python -m app.seed
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
