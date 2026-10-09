# 0011 · Harness: CI, browser smoke test on a fixture plant, self-review loop

Status: accepted by the owner · 2026-10-09 · before T6

## Context

The owner asked for T6 to T9 to run end to end, merging each task once it passes its gate,
and for a harness that checks itself: CI on every PR, a runbook that survives context
resets, the Playwright smoke test brought forward from T8, and a loop that reviews the work,
finds problems and fixes them before each merge. The real scan is gitignored (CLAUDE.md
rule 6), so anything that runs in CI needs its own data.

## Decisions

- **Runbook**: `docs/RUNBOOK.md` holds the gate, the self-review loop, each task's "done
  when" from the PRD with the proof for it, the owner's decisions for the run, and a log.
- **One local command**: `make gate` = `make check` + Playwright smoke + pre-commit.
- **CI**: `.github/workflows/ci.yml` runs the same gate on every pull request and on `main`,
  on `ubuntu-latest` (Docker is available there, so the testcontainers-based API tests and the
  contract tests run unchanged). No secrets.
- **Fixture plant for the browser test**: `scripts/build_e2e_fixtures.py` turns the API's test
  objects (6 objects, 5 issues) into scan `nora`, with as many synthetic points inside each
  object's box as its `point_count` (6,021 in total), and converts them with PotreeConverter.
  The output (`web/e2e/fixtures/data/`, about 140 KB) is committed: it is generated test data,
  not scan data. The smoke test runs the production build in static mode on it
  (`SCAN_DATA_DIR`), with Chromium's software WebGL. Every test fails on any page or console
  error, failed request or HTTP error, and every test requires points of loaded octree nodes in
  view (the `?stats` overlay), so tiles that never arrive or do not decode fail it.
- **Self-review loop**: a fresh reviewer agent with `docs/harness/review-brief.md`; findings are
  verified before fixing, fixed with a test where possible, the gate re-runs, at most 3 rounds,
  every round recorded in the PR.

## Options not chosen

- Smoke test against the real data only (cannot run in CI, so CI would not prove it).
- An AI review step inside CI (needs an API key as a repository secret, which only the owner
  can create; the local loop gives the same review without it).

## Consequences

- `make check` and CI need Docker; the smoke test needs a Playwright browser
  (`pnpm --dir web exec playwright install chromium`).
- When the API fixtures change, `make e2e-fixtures` must be re-run (it needs PotreeConverter);
  `scripts/tests/test_build_e2e_fixtures.py` fails until it is (JSON and tile point counts).
- The smoke test proves the UI path on 6 objects in static mode, not tile streaming (the
  fixture octree is too small to have levels of detail), api mode, or performance on 151.9M
  points; the contract tests and the browser check on the real data cover those.
- CI pins each action to a major version, except `astral-sh/setup-uv`, which publishes only
  full versions (`v10.2.0`).
