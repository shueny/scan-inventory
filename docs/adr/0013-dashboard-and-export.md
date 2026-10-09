# 0013 · Dashboard families, zone counting and CSV export

Status: proposed (owner reviews after the T6–T9 run) · 2026-10-09 · Task T7

## Context

T7 adds the dashboard and the CSV export (PRD 8.5, demo steps 8 and 9). The PRD leaves two open questions to the owner at T7: the class families for the dashboard grouping (question 2) and whether "SW - SE" objects count in both zones (question 3). The owner asked for the T6–T9 run to continue without stopping, so both use the recommended answer and are listed here for review.

## Options and decisions

**1. Class families** (`web/src/domain/summary.ts`, `FAMILIES`)
- *Chosen:* the four families the class palette already uses (`scripts/class_palette.py`): **valves** (1, 2, 9, 10, 11, 12, 22), **instruments** (3, 4), **piping** (8, 20, 23), **equipment** (13, 14, 17). Background (0, 7) is never counted; an unknown class goes to "other". A test checks that every object class of the scan is in exactly one family.
- *Not chosen:* putting flanged joints (23) and piping components (20) in their own family (69 + 14 objects would dominate the chart without saying much), or one bar per class (15 colours in a small chart).

**2. "SW - SE" objects**
- *Chosen:* their own zone, as PRD 5.6 item 7 says for the MVP. The 22 objects are counted once, under "SW - SE".
- *Not chosen:* counting them in both SW and SE (zone totals would no longer add up to 260).

**3. What the export contains**
- *Chosen:* the objects that pass the current inventory filters (with no filter: all 260 objects, background left out unless listed), with their current class, annotated class and review status. The button says how many objects and whether filters apply.
- *Not chosen:* always everything (the user would have no way to export one zone or one system).

## Other choices made inside T7

- Pipe length per zone counts objects whose **current** class is Pipe and sums their PCA length estimates, labelled "estimate (PCA)" with an explanation. "Unreliable" shows how many pipes have a diameter estimate above 0.3 m and their share of the length (PRD 5.6 item 5). On the real data: 85 pipes, ≈ 110.2 m, 24 unreliable (66 % of the length), as in PRD 5.5.
- Review progress counts objects without the background (260); open issues per severity reuse the review queue's rule.
- The chart (Recharts, PRD 7) is hidden from screen readers; the same numbers are in a visually hidden table with a caption. The chart colours are the family hues of the class palette, and the legend names every family (colour is not the only signal).
- CSV: RFC 4180 quoting, CRLF line ends, a UTF-8 byte order mark for spreadsheet programs, and text cells that start with `=`, `+`, `-`, `@` are prefixed with `'` so a spreadsheet does not run them as formulas.
- Bundle: 508 KB gzipped with Recharts (budget 1 MB, PRD 10).

## Consequences

- If the owner prefers other families, only `FAMILIES` and its test change.
- A real-data test (`summary.realdata.test.ts`) checks the PRD numbers when `data/instances.json` is present; in CI, where the data is not, it is skipped.
