# T13 spike: matching objects across two detection runs

Date: 2026-11-17 · Branch `t13-match-spike` · Method: [ADR 0020](../adr/0020-matching-detection-runs.md)

**These numbers are not a real model's accuracy.** Run 2 is built from our own scripted changes and from geometry measured again on sampled point clouds. They show where the method breaks, not how often a real retrained model would trip it.

## Question

When a model is retrained and the same scan gets a second result, can the platform tell which new object is which old one, well enough to keep the reviewers' decisions?

## Setup

- **Run 1:** `data/instances.json`, the 260 objects that are not Structural or Floor.
- **Run 2, three sources:**

  | source | geometry |
  |---|---|
  | `run1` | run 1's own boxes, so only the scripted changes differ |
  | `random13` | every box measured again from `nora-random13.las` (19.7M points, 13 % random sample) |
  | `voxel5mm` | every box measured again from `nora-voxel5mm.las` (18.1M points, one point per 5 mm cube) |

- **Scripted changes** on top of each source (`scripts/perturb_run.py`), 20 seeds (0 to 19), each seed:
  - new ids for every object
  - 10 class changes
  - 5 removed objects
  - 5 added boxes (the size of a random object, at a random place in the plant)
  - one pipe at least 1 m long, cut in two at 30–70 % of its length
  - one random object merged with its nearest neighbour
- **Matcher:** `scripts/match_runs.py`, geometry only, no tags.
- **Scoring:** a change counts as correct only if the matcher returns exactly that group (same kind, same old ids, same new ids).

Reproduce (about 8 s, 504 MB peak memory; the LAS files are read in 2M-point chunks):

```
uv run --project scripts python scripts/t13_match_spike.py
```

## How far sampling moves the boxes

IoU between each object's run 1 box (all 151.9M points) and its box measured from the sample. No object was lost by sampling.

| source | smallest | 5th percentile | median |
|---|---|---|---|
| random13 | 0.625 | 0.861 | 0.971 |
| voxel5mm | 0.877 | 0.950 | 0.990 |

Random sampling drops some of the outermost points, so small boxes shrink. Voxel sampling keeps one point in every occupied cube, so the outline survives better.

## Results at the proposed thresholds (IoU 0.5, containment 0.8)

Correct out of total, summed over 20 seeds:

| source | unchanged | class changed | removed | added | split | merge |
|---|---|---|---|---|---|---|
| run1 | 4809/4840 | 200/200 | 81/100 | 85/100 | 20/20 | 20/20 |
| random13 | 4810/4840 | 200/200 | 83/100 | 85/100 | 20/20 | 19/20 |
| voxel5mm | 4808/4840 | 200/200 | 81/100 | 85/100 | 20/20 | 19/20 |

Wrong groups the matcher made up (random13): 17 merges, 13 splits, 2 uncertain.

## IoU threshold (containment 0.8, random13)

| iou_min | unchanged | class changed | removed | added | split | merge | wrong groups |
|---|---|---|---|---|---|---|---|
| 0.3–0.6 | 4810/4840 | 200/200 | 83/100 | 85/100 | 20/20 | 19/20 | merge 17, split 13, uncertain 2 |
| 0.7 | 4777/4840 | 199/200 | 83/100 | 85/100 | 20/20 | 19/20 | added 15, merge 32, split 13, uncertain 6 |
| 0.8 | 4657/4840 | 193/200 | 83/100 | 85/100 | 20/20 | 18/20 | added 67, merge 65, split 13, uncertain 48 |
| 0.9 | 4377/4840 | 182/200 | 83/100 | 85/100 | 20/20 | 18/20 | added 67, merge 65, split 13, uncertain 339 |

The results stay the same from 0.3 to 0.6, then break at 0.7, just above the smallest sampled IoU (0.625). On voxel5mm they only break at 0.9. Run 1's own boxes give the same result at every threshold.

## Containment threshold (IoU 0.5, random13)

| contain_min | removed | added | merge | wrong groups |
|---|---|---|---|---|
| 0.6 | 80/100 | 82/100 | 19/20 | merge 19, split 15, uncertain 3 |
| 0.8 | 83/100 | 85/100 | 19/20 | merge 17, split 13, uncertain 2 |
| 0.9 | 84/100 | 85/100 | 18/20 | merge 16, removed 1, split 13, uncertain 3 |
| 0.95 | 87/100 | 86/100 | 14/20 | merge 13, removed 5, same 2, split 12, uncertain 5 |

A stricter containment cuts a few false merges, but starts to miss real ones (14/20 at 0.95), because a merged box drawn around two objects does not hold each part completely once the geometry is measured again.

## Cases that could not be matched

Almost every error follows one pattern, and it shows up with run 1's own boxes too, so sampling does not cause it:

- **A removed object inside a big box reads as a merge.** Pipe 45 (16 cm) sits inside the box of vessel SEP-101 (object 46). Remove the pipe, and its old box is inside the vessel's new box: "45 and 46 merged". All 18 false merges (run 1 source) have a pipe on one side.
- **An added box inside a big box reads as a split.** Bent pipe runs have boxes of mostly empty space: pipe 221 is 7.9 × 1.5 × 1.5 m, pipe 222 is 7.1 × 1.4 × 1.5 m. A new object that lands inside one reads as "the pipe split in two". Of the 13 false splits (run 1 source), 11 are a pipe and 2 a tank.
- Each such error also takes one unchanged object with it, which is why "unchanged" is about 30 short of 4840.

Splits and merges that really happened were found every time, apart from one merge in each of the sampled sources.

## What this means for the product

- With the proposed product rules (PRD T13), a split or merged object never inherits a decision. So these errors send objects back to the review queue; they do not carry a wrong decision forward. The cost is review time: each false split or merge puts one unchanged object in the queue next to the real change. Here that was about 1.5 objects per seed, out of 260.
- Unchanged objects and class changes, by far the most common case, match reliably, and a class change is flagged every time.

## Options for the owner (not done)

1. **Accept and continue** with IoU 0.5 and containment 0.8. False splits and merges go to the review queue, and the difference report lists them.
2. **Add a class rule:** the parts of a split must have the old object's class, and a merge must keep one of its parts' classes. That would cut many false groups here. But our own scripted changes make up the test, so the gain would partly be by design.
3. **Match by shared points instead of boxes.** Both runs label the same scan, so for each pair of objects we can count the points that carry both labels. A bent pipe then has no empty space, and a flange next to it shares no points. This needs per-point labels from both runs, so it cannot be tested with box-only scripted changes, and the import would need the point labels as well.

## Decision (owner, 2026-11-17)

Option 1: continue with IoU 0.5 and containment 0.8. False splits and merges go to the review queue. The data model is decided in the schema task, with its own ADR.
