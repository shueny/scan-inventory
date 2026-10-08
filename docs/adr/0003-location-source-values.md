# 0003 · location_source values and primary tag

Status: accepted · 2026-10-08 · Task T1

## Context

Most objects have no P&ID row (pipes, flanges), so their zone is borrowed from the nearest object that has a P&ID zone. Two tagged objects (PVE-103, SEP-101) also have no zone in the P&ID. Before T1 both cases were labelled `nearest_tag`, which hid that a tagged object's zone is a guess. The `zone_borrowed` issue rule needs to tell the two apart.

## Options for the new value

- `tagged_nearest_tag`: mirrors the existing `nearest_tag`, reads as "tagged, zone from nearest tag".
- `nearest_tag_tagged`: the name in the PRD draft; same meaning, reads less naturally.
- `pnid_tag_no_zone`: describes the cause instead of where the zone came from.

## Decision

`location_source` is one of `pnid`, `tagged_nearest_tag`, `nearest_tag`, `background`. A new boolean `has_tag` is added so code does not have to infer it from `tag`.

Primary tag: `tag` is the first P&ID row in file order that points to the object; `all_tags` keeps all of them. (In the current data no object has more than one tag.)

## Consequences

- `zone_borrowed` is a one-line filter on `location_source`.
- The API and frontend must accept the new value (T4, T5).
