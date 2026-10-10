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
4. **Re-run the gate** (steps 1 to 5 above), push, and wait for CI on the pushed commit; a round
   is closed only when CI is green. Then start the next review round on the new diff.
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
| harness | CI runs the gate on PRs; smoke test runs in CI | green CI on the harness PR | done (PR #4) |
| T6 review queue | demo steps 6 and 7 work; every issue type from PRD 5.6 can be resolved | contract tests per resolution; e2e resolves an issue; browser check on real data | done (PR #5) |
| T7 dashboard + export | demo steps 8 and 9 work in both modes | unit tests for `domain/summary.ts`, `domain/exportCsv.ts`; e2e downloads the CSV (static); browser check in api mode | done (PR #6) |
| T8 polish + docs | fresh clone + README reproduces the demo; one Playwright smoke of the demo path; recorded performance numbers | README steps run from a clean clone; e2e covers the demo path | done (PR #7) |
| T9 demo deployment | demo mode UI (PRD 8.7); tiles on R2 under a versioned path; Pages deploy workflow; Range request returns 206; README links the demo | code + scripts merged; demo stack e2e (wrangler pages dev + local R2); owner runs the account steps in `docs/DEPLOY.md` | code merged (PR #8); live checks wait for the owner's steps (DEPLOY 0 to 10) |

## Owner-only steps (collected here as they come up)

- T9: everything in [docs/DEPLOY.md](DEPLOY.md), in this order:
  1. Cloudflare account, R2 bucket, R2 token and rclone remote (with `no_check_bucket`).
  2. Upload the data (video included).
  3. Create the Pages project with `wrangler login`.
  4. Set up Zero Trust: One-time PIN and the two Access apps with the invited emails, before any deploy.
  5. Deploy once and check that `octree.bin` returns 206 through Access.
  6. Add the GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
  7. Set `VITE_DEMO_VIDEO_URL`, and add the live address and the video link to the README.
  8. The T9 checks on the live demo (DEPLOY step 10): the demo script in Chrome and in Firefox,
     and first points within about 5 s on a normal connection.
- T9: confirm the About panel's diagram (a three-box picture rather than a full architecture
  drawing). ADR 0015 was accepted on 2026-10-10, with the demo kept to NORA only and no upload.

## Proposals for the owner (not done; no silent scope growth)

- T6: assigning a P&ID tag to an object could also close the `tag_missing_in_scan` issue for that
  tag, and drop already-used tags from other objects' candidates (ADR 0012, consequences).
- T6: filter the queue with the inventory filters; "next open issue" after resolving; more room
  for the queue at 1280 px.
- T7 (open questions 2 and 3, ADR 0013): confirm the families, "SW - SE" as its own zone, and
  that rejected objects are left out of the numbers.
- T8: the GitHub repository is private; the README's clone step needs access. Make it public
  before sharing the README (or the demo's About link)? ADR 0014 (compose web service) to confirm.

## Log

- 2026-10-09: runbook created on branch `harness`; ADR 0011.
- 2026-10-09: harness review round 1: 0 high, 2 medium (smoke passed with a broken point cloud;
  errors only checked in one test), 8 low. Both mediums confirmed and fixed, 7 lows fixed, 1 noted.
- 2026-10-09: harness review round 2: 1 high (CI could not start: `setup-uv@v10` has no major
  tag; round 1 had been logged as done before CI was green), 1 medium (points overlay counted
  nodes not yet loaded), 6 low. All confirmed and fixed. Lesson for the loop: a round is only
  closed when CI on the pushed fix is green, not when the local gate is.
- 2026-10-09: harness review round 3: CI green on 19f9119 (run 37987459550), 0 high, 0 medium,
  3 low (all fixed). Loop closed. Merged to main (PR #4).
- 2026-10-09: T6 built on branch `t6-review-queue`; ADR 0012.
- 2026-10-09: T6 review round 1 (CI green on 6bd13b3): 1 high (queue "Change class" started on
  Structural), 4 medium (no zone_borrowed in the fixtures; tag/issue linking; ARIA tabs; api mode
  only via contract tests), 5 low. High and 2 mediums fixed with tests; tag linking proposed to
  the owner; api-mode risk accepted in ADR 0012; 2 lows fixed, 3 noted.
- 2026-10-09: T6 review round 2: CI red on 47025b3 from a Docker Hub pull rate limit (infra;
  CI now pre-pulls with retries and skips the testcontainers clean-up image), 0 high, 2 medium
  (both class pickers kept a stale class after a change in the other panel; one click undid
  it), 4 low. All fixed, mediums with tests that failed first.
- 2026-10-09: T6 review round 3 (last): CI red on 269c3a3 again, auth.docker.io unreachable from
  the runner, so retries could not help (high). CI now pulls the same postgres image from the
  AWS public mirror and tags it. 4 low (sleep after the last retry; focus moved on a refetch;
  a stale pick one step later; no negative focus test), all fixed with tests. No finding left
  open; merge only after CI is green on the fix.
- 2026-10-09: T6 merged (PR #5, CI green on 2526a02). T7 built on branch `t7-dashboard`; ADR 0013.
- 2026-10-09: T7 review round 1: CI red (real-data test read the gitignored file during
  collection, high), 9 medium, 2 low. Fixed: the skip guard; "Other" family; zone x class view;
  chart no longer a Tab stop; download for Firefox/Safari; dashboard without issues; 1280 px
  layout; tests tightened. Decided (proposed in ADR 0013): rejected objects are not counted.
  Rejected: CSV box sizes differ between modes (checked: all 789 values equal). Accepted risk:
  api mode covered by contract tests, not by the smoke test.
- 2026-10-10: T7 review round 2: CI green on 0628fd6; the rejected CSV finding re-checked by the
  reviewer (0 differences). 1 medium (no test proved the chart draws: a 0-height chart passed),
  5 low. Fixed: smoke counts drawn bars before and after the per-class view (fails on a 0-height
  chart); chart rendered only when shown; per-class zones come from the function; keyboard
  reachable, labelled scroller with a sticky class column; mocks restored, revoke after 1 s
  asserted; rejected objects checked in the per-class counts.
- 2026-10-10: T7 review round 3 (last): CI green on e45fb15, 0 high, 0 medium, 4 low (sticky
  header layering, queue error text on the dashboard tab, a real 1.1 s wait in a test, no test
  that chart and table zones agree). All fixed. Loop closed. Merge after CI is green.
- 2026-10-10: T7 merged (PR #6, CI green on 57c52d1). T8 on branch `t8-docs`: README, compose
  `web` service (ADR 0014), performance measured on the MacBook Air M3. Review agents had left
  5.7 GB of data copies in the scratchpad (free disk fell to 6.7 GB); removed, and the reviewer
  brief now forbids copies and writes to the owner's services.
- 2026-10-10: T8 fresh-clone check: README steps from a clean clone (13 % tiles, second compose
  stack on ports 8188/8100/8180) all exit 0 in about 2 minutes; demo steps 1 to 9 pass there
  (3D pick 3 of 8 clicks on objects, issue resolved and kept after reload, CSV 260 rows). Stack,
  volume, images and clone removed. Smoke test extended with step 4 (fails without picking).
- 2026-10-10: T8 review round 1: CI red (high): the step 4 test swept a horizontal band, but in CI
  the device preset set a 1280 x 720 viewport and the objects lay on a diagonal, so no click hit.
  Now deterministic: `?e2e` exposes the camera projection and the pick method; the test clicks
  object 3's centre and requires "Object 3" picked on the GPU (passes on Metal and SwiftShader).
  Mediums: repo is private (README says so; visibility is the owner's call), Playwright browser
  now in `make install`, api healthcheck before web starts, performance re-measured uncapped.
  Lows: nginx re-resolves the api, 404 for missing assets, gzip, tiles revalidated, ports in
  .env.example, diagram link. Not changed: Dockerfile copies test files for tsc (works; noted).
- 2026-10-10: T8 review round 2: CI green on 8e84974 (step 4 passed 15/15 repeats), 1 medium (the
  vsync-off "~370 fps" claim measured frame scheduling, not the GPU, and the script was not
  committed), 2 low. Fixed: `web/perf/measure-orbit.mjs` committed (`pnpm --dir web perf`),
  README reports vsync-on frame times (144 Hz held, worst 8.8 ms, 0 frames over 33 ms) with
  what they cannot show; index.html no-cache; e2e hook removed on unmount, pick method read-only.
- 2026-10-10: T8 review round 3 (last): CI green on fae7a44, 0 high, 0 medium, 4 low (perf
  script argument with pnpm's "--", gzip level, a point count wording, load-time precision).
  All fixed. Loop closed.
- 2026-10-10: T8 merged (PR #7, CI green on 4a2f683). T9 on branch `t9-demo`: demo mode UI,
  Pages Function for R2 with Range (ADR 0015), demo-stack e2e under wrangler pages dev (8/8),
  upload script, deploy workflow (skips until secrets exist), docs/DEPLOY.md, recording script.
- 2026-10-10: T9 review round 1: CI green on b1e103f, 1 high (upload script stopped under
  macOS bash 3.2 `set -u` with an empty array; only the dry run had been tested), 6 medium
  (rclone with a bucket-scoped token; loading overlay never showed progress and came back;
  206 headers from our parse instead of R2's returned range; About dialog had no focus trap;
  no diagram in About; DEPLOY order left the demo public before Access), 10 low. All fixed:
  both upload paths tested under /bin/bash; Function asks R2 for an explicit range and builds
  Content-Range from R2's answer, with 416/304/404/405 and HTTP tests on the Cloudflare runtime
  (11/11); DEPLOY reordered (Access before the first deploy); focus trap and restore; diagram;
  About text per mode; banner focus and error state; .wrangler/ ignored.
- 2026-10-10: T9 review round 2: CI green on 3f20d17, 0 high, 4 medium (any R2 error on a ranged
  read became 416; the loading clock restarted at step 2, so the slow notice could fail to show;
  the seconds counter was inside a live region; About's focus trap leaked after a backdrop
  click), 5 low. All fixed with tests: handler moved to cloudflare/r2Handler.ts and tested with
  a stub bucket (416 only for a start past the end, other errors rethrown); overlay tested with
  a fake viewer; document-level focus trap tested from outside; If-None-Match + Range HTTP
  tests; DEPLOY notes (rename on error, manual Access app, live past-the-end check).
- 2026-10-10: T9 review round 3 (last): CI green on 06a6bdf, 0 high, 2 medium (three T9
  done-when checks were missing from the owner's list; Shift+Tab could leave About when the
  dialog box itself had focus), 3 low. All fixed with tests; as this was the last round, the
  fixes were checked by the gate and CI, not by a fourth review.
- 2026-10-10: T9 code merged (PR #8, CI green on aacfcd1). The run T6 to T9 is finished on the
  code side. Left for the owner: the steps in docs/DEPLOY.md (step 10 holds the live T9 checks)
  and the proposed ADRs 0012 to 0015.
- 2026-10-10: owner accepted ADR 0015 and decided the demo stays NORA only, with no upload, so it
  needs no hosted backend or paid storage.
