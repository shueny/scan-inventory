# 0008 · Fixed creation date in the LAS header

Status: accepted by the owner · 2026-10-09 · T2 follow-up (verification finding D3)

## Context

`export_las.py` output was byte-identical only on the same calendar day: laspy writes today's date into the LAS header (bytes 90–93, day of year and year). Points and stats never changed. This matters for T9 if tile uploads decide "changed or not" by comparing file hashes: a rebuild on another day would look like a change and re-upload ~400 MB for nothing.

## Options

| | what goes in the header | same bytes across days | same bytes after copying the PLY | meaning of the date |
|---|---|---|---|---|
| A · constant in code | `CREATION_DATE = 2026-10-08` (the T2 export date, same as the sampling seed) | yes | yes | "the day this export format was fixed", not the day of the run |
| B · PLY modification time | date of `pointcloud/nora.ply` mtime (2025-05-19) | yes | no: a re-download or `cp` without `-p` changes mtime | "when the source data was produced" |
| C · keep today's date | today | no | no | true run date; T9 would have to hash the points, not the file |

## Decision

A, a constant. Simplest to explain and the only option where the output depends on nothing but the input content and the code. The LAS spec calls the field "file creation day"; nothing in our pipeline (PotreeConverter, verify_potree.py, the viewer) reads it.

## Consequences

- New exports of the same PLY with the same options are byte-identical on any day. Checked on the real data with `--sample 0.05`: old and new code differ in exactly one byte (offset 91, day of year); stats are identical.
- This does **not** make the Potree tiles reproducible. PotreeConverter 2.1.2 writes a different `octree.bin` (103M of 160M bytes differ) and `hierarchy.bin` on two runs of the same LAS; `metadata.json` is identical. If T9 wants to skip unchanged uploads, it should compare the LAS hash (or `metadata.json` plus a hash of the LAS) rather than tile hashes.
- When the export format changes on purpose, bump `CREATION_DATE` so the date still says something.
- If the owner prefers B or C, only `make_header()` and `test_output_bytes_do_not_depend_on_the_day` change.
