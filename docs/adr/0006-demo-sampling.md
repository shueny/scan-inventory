# 0006 · Sampling method for the public demo tiles

Status: accepted by the owner · 2026-10-09 · Task T2

## Context

The public demo needs about 20M of the 151.9M points (PRD 8.1 P3), deterministic, under 1 GB of tiles, with small objects still visible and pickable. The smallest object (instance 45, a pipe) has 1,100 points.

## Options (measured on the real data)

| | random `--sample 0.13` | voxel `--voxel-size 0.005` |
|---|---|---|
| points | 19,747,077 | 18,105,623 |
| export time | 24 s | 498 s |
| Potree tiles | 399 MB | 368 MB |
| objects lost | 0 | 0 |
| fewest points kept by any object | 143 | 371 |
| share of each object kept | 11.6 % – 13.7 % (even) | 5.7 % – 60 % (small objects keep more) |
| deterministic | yes (fixed seed, fixed chunk size) | yes (first point per cube in file order) |

Screenshots of the same close-up (pressure meter, instance 10) are in `docs/spikes/T2-report.md`. At the default point budget they look nearly the same; voxel edges are slightly more even.

## Decision

Random sampling, `--sample 0.13`.

- 20x faster, simpler to explain ("each point kept with probability 0.13"), and every object keeps the same share, so point counts in the demo stay proportional to the full scan.
- 143 points on the smallest object is enough to see and pick it.
- Voxel's advantage (more points on small objects) is real but not needed at this size. Its current implementation is also slow and memory-heavy (it remembers ~18M cube keys); its peak memory footprint was measured at 1.62 GB, 81 % of the 2 GB pipeline limit (`docs/spikes/T2-verification.md`, check 4c).

## Consequences

- `export_las.py` keeps both methods; the demo build uses `--sample 0.13`.
- If a demo object turns out too sparse to pick, raise the fraction or switch to voxel; tiles budget leaves room (399 MB of 1 GB).
