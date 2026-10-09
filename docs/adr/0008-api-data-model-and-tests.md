# 0008 · API data model, seeding and test database

Status: accepted by the owner · 2026-10-09 · Task T4

## Context

T4 builds the FastAPI service on PostgreSQL 16 (PRD 8.2). The PRD gives the minimum tables and leaves three choices to the owner: how to store vectors, tag lists and classes; when to seed from the pipeline's JSON; and how tests get a Postgres (testcontainers or a compose service).

## Options and decisions

**Storage**
- *Chosen:* Postgres arrays for vectors (`centroid`, `bbox_min`, `bbox_max` as `float[]`) and tag lists (`text[]`), JSONB for `candidate_tags`, and a separate `scan_class` table. `instance.class_id` and `instance.current_class_id` have composite foreign keys to `scan_class (scan_id, class_id)`, so the database itself refuses a correction to a class that does not exist.
- *Not chosen:* one column per coordinate (12 extra columns, class list as JSONB without foreign keys) or the whole instance as JSONB (no schema guarantee for the PRD's field list).

**Seeding**
- *Chosen:* `python -m app.seed`, idempotent (if the scan exists nothing is written, so review changes survive restarts), in one transaction. The API container runs `alembic upgrade head` → seed → uvicorn on start, so `docker compose up` is one step.
- *Not chosen:* seeding inside the FastAPI startup hook (several API processes would race; migration and seed failures would look like app crashes).

**Test database**
- *Chosen:* testcontainers. `pytest` starts a throwaway `postgres:16-alpine`, applies the real Alembic migration, and each test starts from a small synthetic data set (`api/tests/fixtures/`). No manual setup; needs Docker running.
- *Not chosen:* a `db-test` compose service (one more manual step and manual cleanup between runs).

## Other choices made inside T4

- `scan` (id, name, source, licence, doi, point_count, zones), `scan_class`, `instance` (primary key `(scan_id, instance_id)`), `issue` (primary key `(scan_id, issue_id)`, plus `sort_order` = position in `issues.json`, so the pipeline's order is kept within a severity), `review_event` (append-only, bigserial id, `actor` = "local user").
- The zone column and API field are called `location`, like the pipeline and the frontend; only the query filter keeps the PRD's name `?zone=`.
- `review_event.instance_id` is nullable: dismissing a `tag_missing_in_scan` issue touches no object but must still be in the history.
- Status values are `CHECK` constraints instead of Postgres enums (simpler migrations).
- Business rules (`app/services.py`): changing the class without a status marks the object `corrected`; `accept_suggestion` only applies a class suggestion; `assign_tag` needs an issue with exactly one object; closing an issue twice is `409`; unknown ids `404`; invalid but well-formed requests `422` with a readable `detail`. Every write runs in one transaction and every change writes a `review_event` and a log line with scan, instance, issue and action.
- The API never serves point data. Tiles come from an `nginx` container (`infra/nginx/tiles.conf`): Range requests, no compression on tiles, CORS only for the local web origin.
- Credentials only in `.env` (gitignored, `.env.example` committed); compose refuses to start without them.

## Consequences

- `make check` (API part) needs Docker running.
- A test checks that the migration and `models.py` stay identical (Alembic autogenerate finds no difference).
- Resolving an issue does not close related issues (e.g. assigning PT-108A to transmitter 17 leaves `tag_missing_in_scan:PT-108A` open). The review queue can do that in T6 if wanted.
