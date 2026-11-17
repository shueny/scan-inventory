# 0021 · Detection runs in the database

Status: accepted (owner chose every option below, 2026-11-17) · Task T14

## Context

A retrained model gives the same scan a second and a third result. T13 showed the objects of two runs can be matched well enough ([ADR 0020](0020-matching-detection-runs.md)). Before this task the `instance` table was two things at once: the model's result (geometry, class, tags) and the object the reviewers decide on (`review_status`, `current_class_id`). Review events, issues and the 3D tiles all point at `(scan_id, instance_id)`. A second run had nowhere to go.

This task only adds the storage. The current data becomes run 1, and the app must behave exactly as before. Importing a second run is the next task.

## Options and decisions

**Table layout.**

- **(a) Chosen: keep `instance` as the stable object and add three tables.**
  - `detection_run`: one row per model result, `run_no` counting up per scan.
  - `detection`: each object of a run, as it arrived. The whole record goes in `raw` (JSONB), and the fields matching needs (class, point count, centroid, box) are also columns.
  - `detection_link`: which instance a detection belongs to, with the match kind (`initial`, `same`, `split`, `merge`, `uncertain`, `added`) and the IoU.

  `instance` keeps the review state. Its geometry is a copy of the latest run, and `latest_run_id` says which one. API, UI and tiles stay unchanged. The cost: the geometry is stored twice, and an import must update both.
- (b) Rename `instance` to `object` with only the id and review state, and read geometry from the latest detection with a join. Cleanest, but every query and service changes.
- (c) A new set of `instance` rows per run with a lineage table, copying decisions forward. Least code, but a copied decision is not the same decision. It breaks the proposed rule "a human decision stays valid until a human reviews the object again", and one object's history ends up spread over several rows.

**Object id.**

- **(a) Chosen: run 1's `instance_id` stays the object id.** Objects first seen in a later run get ids above the current maximum. Tiles and GPU picking keep working.
- (b) A new serial or UUID with a mapping in the API. Needs a lookup on every pick, or rebuilt tiles.

**Review events.**

- **(a) Chosen: events stay on the object, plus `review_event.run_id`,** the scan's current run (highest `run_no`) when the decision was made. That answers "which result was this decision based on?" without splitting an object's history.
- (b) Events on the detection. Each run's events would be separate, and an object's history would have to be rebuilt across runs.

**Existing databases.**

- **(a) Chosen: Alembic migration `0002` fills run 1 from the existing rows.** One run per scan, one detection and one `initial` link per instance, and `run_id` = run 1 on every existing event. `raw` holds the instance row without its review columns, because the original JSON is not in the database. Review state and history are kept. Downgrade drops the new tables and columns and keeps the review state.
- (b) Empty the database and seed again. Simpler, but the review history is lost.

## Consequences

- API responses, the OpenAPI schema, the UI and the tiles are unchanged; the existing API tests and the contract test pass as before.
- `seed.py` writes run 1 (`source = "instances.json"`) with each record from the file in `raw`.
- Every review event now carries a run. `services._event` looks up the current run per event, one small indexed query.
- Issues are not tied to a run yet. Recomputing issues for a new run belongs to the import task.
- The invitation demo has no database. It is untouched and keeps PRD 8.7: a new data version starts clean.
