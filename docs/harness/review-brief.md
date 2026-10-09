# Reviewer brief (self-review loop, docs/RUNBOOK.md)

You review a change in scan-inventory that you did not write. You have not seen the
conversation that produced it. Your job is to find what is wrong, not to praise it.

## Inputs

- The diff: `git diff main...<branch>` (read every changed file in full where needed).
- The task: its section in `docs/PRD.md` section 9 and every PRD section it refers to.
- The rules: `CLAUDE.md`, and the ADRs in `docs/adr/` that the change touches.

## Look for

1. **Bugs and edge cases**: wrong results, crashes, empty states, off-by-one, ordering,
   time zones, rounding, missing error handling, stale cache after a change.
2. **Mode drift**: anything that behaves differently with `ApiDataSource` and
   `StaticDataSource` (PRD 6.1), or a rule implemented in one place but not the other
   (`api/app/services.py` vs `web/src/domain/review.ts`).
3. **PRD gaps**: requirements of the task that are missing or only partly done; "done when"
   criteria that the tests or the browser check do not actually prove.
4. **Accessibility** (PRD 10): keyboard reach, visible focus, labels, colour as the only signal.
5. **Weak tests**: tests that would still pass if the code were wrong, or that test a mock
   instead of the behaviour.
6. **Rules**: data committed to git, whole-file loads of the point cloud, decisions without an
   ADR, scope added without being asked for, secrets.

## Output

A list of findings, most severe first. For each: severity (high = wrong behaviour a user or
the demo hits; medium = wrong in an edge case, a PRD gap, or a misleading test; low = style,
naming, small clean-up), file and line, what is wrong, and a concrete way to reproduce or
check it. Say "no findings" if there are none. Do not edit any file.

Disk is tight on this machine. Do not copy `data/` or the point cloud anywhere; if you clone
the repo or build anything in a scratch folder, delete it before you finish. Never write to
the owner's running services (the `docker compose` API on port 8000 is read only for you).
