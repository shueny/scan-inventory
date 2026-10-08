# 0002 · Class mapping for the class_mismatch rule

Status: accepted · 2026-10-08 · Task T1

## Context

The `class_mismatch` rule needs to know which annotated classes fit each P&ID element type. The P&ID has 19 element types; the dataset has 17 classes, and some element types have no matching class (there is no Pump class). The PRD asks for an explicit table, reviewed by the owner, and requires that the two known mismatches (instance 1, PSV-103A; instance 169, VBT-109C) are found.

Every P&ID row was cross-checked against the class its instance actually has before the table was written.

## Options for pumps

The pump casing is annotated as Piping components (20) and the drive as Motor (13).

1. Allow {13, 20}. Matches how the dataset is annotated; no false alarms.
2. Leave pumps unmapped (skipped and logged). Also no false alarms, but a pump annotated as something unrelated (e.g. Pipe) would not be caught.
3. Allow only {13}. Strict, but flags four correct objects (163, 164, 177, 178) as high severity and floods the queue.

## Decision

- Pumps allow {13, 20} (option 1). One pump tag covering both a motor and a casing is reported separately by `tag_split`.
- Ball valves allow {2, 22}. In the data every ball valve up to 3/4" is a Small manual valve (22) and every one from 1 1/2" is a Manual lever valve (2). The suggested class for a mismatched ball valve follows that size split (below 1" -> 22).
- All other element types map to the one class the data shows (table in `scripts/class_mapping.py`).

Result on the real data: exactly two `class_mismatch` issues, instances 1 and 169.

## Consequences

- A new P&ID element type is skipped with a warning until it is added to the table.
- The 1" size split is learned from 14 ball valves in this one scan. Another plant may annotate differently; the suggestion is only a default, the reviewer decides.
