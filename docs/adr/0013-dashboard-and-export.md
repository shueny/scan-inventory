# 0013 · Dashboard families, zone counting and CSV export

Status: proposed (owner reviews after the T6–T9 run) · 2026-10-09 · Task T7

## Context

T7 adds the dashboard and the CSV export (PRD 8.5, demo steps 8 and 9). The PRD leaves two open questions to the owner at T7: the class families for the dashboard grouping (question 2) and whether "SW - SE" objects count in both zones (question 3). The owner asked for the T6–T9 run to continue without stopping, so both use the recommended answer and are listed here for review.

## Options and decisions

**1. Class families** (`web/src/domain/summary.ts`, `FAMILIES`)
- *Chosen:* the four families the class palette already uses (`scripts/class_palette.py`): **valves** (1, 2, 9, 10, 11, 12, 22), **instruments** (3, 4), **piping** (8, 20, 23), **equipment** (13, 14, 17). Background objects are never counted. An object corrected to a class outside the four (for example Structural) is shown as **Other**, so every zone total equals the sum of its bars. Tests check that every object class of the scan is in a named family (also against `data/scan.json` where present).
- PRD 8.5 also asks for counts per zone × class: the chart shows families, and a "Per class" view next to it shows the full zone × class table (`countsByZoneAndClass`).
- *Not chosen:* putting flanged joints (23) and piping components (20) in their own family (69 + 14 objects would dominate the chart without saying much), or one bar per class (15 colours in a small chart).

**2. "SW - SE" objects**
- *Chosen:* their own zone, as PRD 5.6 item 7 says for the MVP. The 22 objects are counted once, under "SW - SE".
- *Not chosen:* counting them in both SW and SE (zone totals would no longer add up to 260).

**3. Rejected objects** (review round 1 of T7)
- *Chosen:* an object the reviewer **rejected** ("not a real object") is left out of the zone
  counts, the per-class counts and the pipe length, but counts as reviewed in the progress.
  It stays in the inventory table and in the CSV, with its status.
- *Not chosen:* counting it like any other object (a ghost would still add metres of pipe).

**4. What the export contains**
- *Chosen:* the objects that pass the current inventory filters (with no filter: all 260 objects, background left out unless listed), with their current class, annotated class and review status. The button says how many objects and whether filters apply.
- *Not chosen:* always everything (the user would have no way to export one zone or one system).

## Other choices made inside T7

- Pipe length per zone counts objects whose **current** class is Pipe and sums their PCA length estimates, labelled "estimate (PCA)" with an explanation. "Unreliable" shows how many pipes have a diameter estimate above 0.3 m and their share of the length (PRD 5.6 item 5). On the real data: 85 pipes, ≈ 110.2 m, 24 unreliable (66 % of the length), as in PRD 5.5.
- Review progress counts objects without the background (260); open issues per severity reuse the review queue's rule.
- The chart (Recharts, PRD 7) is hidden from screen readers and is not a Tab stop (`accessibilityLayer={false}`); the same numbers are in a visually hidden table with a caption, and the "Per class" table is visible to everyone. The chart colours are the family hues of the class palette, and the legend names every family (colour is not the only signal).
- CSV: RFC 4180 quoting, CRLF line ends, a UTF-8 byte order mark for spreadsheet programs, and text cells that start with `=`, `+`, `-`, `@` are prefixed with `'` so a spreadsheet does not run them as formulas.
- Bundle: 508 KB gzipped with Recharts (budget 1 MB, PRD 10).
- The download keeps the blob URL alive for a second and clicks a link that is in the document,
  because Firefox and Safari can cancel a download whose URL is revoked at once.
- The dashboard needs only the instances; if the issues are still loading or failed, only the
  open-issue counts show "…".
- At 1280 × 800 the Export button and the pipe totals are in view; the open-issue counts need a
  short scroll inside the panel.

## Consequences

- If the owner prefers other families, only `FAMILIES` and its test change.
- A real-data test (`summary.realdata.test.ts`) checks the PRD numbers, per zone, when `data/` is present; in CI, where it is not, the file is skipped without reading anything.
- The smoke test runs in static mode only; the CSV columns come from `Instance`, which the contract suite checks for both modes (accepted risk, as in ADR 0012). A one-off check against the running API found all 789 box sizes equal to the static source's values.
