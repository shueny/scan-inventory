# Runbook: T6 → T9

The owner asked for T6 to T9 to run end to end, each task merged once its gate passes (2026-10-09). This file is the checklist for that run: what "done" means per task (PRD section 9), the commands that prove it, and where things stand. It is updated at the end of every step, so the run can continue after a context reset.

## The gate, for every task

A task is merged only when all of these pass and their output is in the PR. Steps 1 to 3 are one
command: `make gate`.

1. `make check` (scripts, api, web unit tests, web contract tests against the real API).
2. `uvx pre-commit run --all-files`.
3. `pnpm --dir web test:e2e` (Playwright smoke on the fixture data in `web/e2e/fixtures/`). It runs
   the app in **static mode** only; api mode is proven by the contract tests (same data source
   behaviour) plus the browser check in step 5, which covers both modes.
4. CI green on the PR (`.github/workflows/ci.yml` runs 1 to 3).
5. A browser check of the task's demo steps on the real data, written in the PR.
6. ADR for every decision, `docs/LEARNING.md` section with 3 quiz questions.
7. **Self-review loop** (below) ended with no open high or medium finding.

## Self-review loop

The code is not trusted because its author wrote it. Before merging, each task goes through:

1. **Review.** A fresh reviewer agent with the brief in `docs/harness/review-brief.md`, which has
   not seen how the code was written, gets the
   diff against `main`, the task's PRD text, `CLAUDE.md` and ADRs, and looks for: bugs and
   edge cases, behaviour that differs between the two data sources, PRD requirements that are
   missing or only half done, accessibility (PRD 10), tests that would pass even if the code
   were wrong, and silent scope growth. Each finding gets a severity (high / medium / low),
   a file and line, and a concrete way to reproduce it.
2. **Verify.** Each finding is checked against the code (and reproduced where possible).
   Wrong findings are marked "rejected" with the reason; nothing is fixed on faith.
3. **Fix.** Every confirmed high and medium finding is fixed, with a test that fails without
   the fix where the finding is testable. Low findings are fixed when cheap, else listed.
4. **Re-run the gate** (steps 1 to 5 above), then start the next review round on the new diff.
5. **Stop** when a round finds no confirmed high or medium finding, or after 3 rounds; in the
   second case the open findings go to the owner in the PR instead of being merged silently.

Each round is recorded in the PR: findings, verdicts, fixes, and the gate output after it.

Merge: fast-forward `main` to the task branch, then start the next task from `main`.

## Owner decisions taken for this run

- Merge each task after its gate (no stacked PRs).
- Harness: CI on every PR, this runbook, Playwright smoke from the start (brought forward from T8),
  and a self-review loop that finds problems and fixes them before every merge.
- Public demo: Cloudflare Pages + R2, with Cloudflare Access so only invited people can open it (option A, not public yet).

## Tasks

| task | PRD "done when" | proof | status |
|---|---|---|---|
| harness | CI runs the gate on PRs; smoke test runs in CI | green CI on the harness PR | in progress |
| T6 review queue | demo steps 6 and 7 work; every issue type from PRD 5.6 can be resolved | contract tests per resolution; e2e resolves an issue; browser check on real data | not started |
| T7 dashboard + export | demo steps 8 and 9 work in both modes | unit tests for `domain/summary.ts`, `domain/exportCsv.ts`; e2e downloads the CSV (static); browser check in api mode | not started |
| T8 polish + docs | fresh clone + README reproduces the demo; one Playwright smoke of the demo path; recorded performance numbers | README steps run from a clean clone; e2e covers the demo path | not started |
| T9 demo deployment | demo mode UI (PRD 8.7); tiles on R2 under a versioned path; Pages deploy workflow; Range request returns 206; README links the demo | code + scripts merged; owner runs the account steps in `docs/DEPLOY.md` | not started |

## Owner-only steps (collected here as they come up)

None yet.

## Log

- 2026-10-09: runbook created on branch `harness`; ADR 0011.
- 2026-10-09: harness review round 1: 0 high, 2 medium (smoke passed with a broken point cloud;
  errors only checked in one test), 8 low. Both mediums confirmed and fixed, 7 lows fixed, 1 noted.
