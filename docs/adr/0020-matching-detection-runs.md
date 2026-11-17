# 0020 · Matching objects across two detection runs

Status: method accepted (owner, 2026-11-17); thresholds and whether to continue are open, see the decision gate in [T13](../PRD.md) · Task T13

## Context

A retrained model gives the same scan a new result. Each run has its own ids, may split a pipe in two, merge two neighbours, drop or add objects, and shift every box a little. To keep review decisions across runs, the platform has to say which new object is which old one. T13 measures how well that works before any schema change. Results: [docs/spikes/T13-match-runs.md](../spikes/T13-match-runs.md).

## Options

Matching method:

1. **Overlap groups (chosen).** Pair boxes that clearly are the same object, then group the rest by which box holds them: one old box holding several new ones is a split, the mirror is a merge, nothing left over is removed or added. Splits and merges come out of the same rule. Crowded areas need one extra rule (below).
2. **Hungarian algorithm.** The best one-to-one assignment over a cost matrix. Well known, but one-to-one by design, so splits and merges need a separate pass afterwards.
3. **Greedy.** Pair by highest overlap first. Simplest; an early wrong pair is never undone, and splits and merges are not found.

Overlap measure:

1. **IoU plus containment (chosen).** IoU (intersection / union) says "same object". Containment (intersection / the smaller box's volume) says "this box sits inside that one": half a pipe has IoU about 0.5 with the whole pipe but containment 1. Two thresholds to set.
2. **IoU only.** One threshold, but a split or merge reads as one removal plus one addition.
3. **IoU of PCA-oriented boxes.** Better for diagonal pipes, much harder to intersect, and most pipes here run along the axes.

## Decision

`scripts/match_runs.py`, a pure function over axis-aligned boxes, geometry only:

1. **same:** two boxes that are each other's best IoU, at or above `iou_min`.
2. **split:** unpaired new boxes inside one old box (containment at or above `contain_min`), together with that box's own pair if the pair is inside it too.
3. **merge:** the mirror of step 2.
4. **uncertain:** one unpaired box inside one unpaired box: probably the same object with a very different box. A human decides.
5. **removed / added:** what is left.

The P&ID tag is not used: a real model's output has no tag, so the spike measures the hard case. Structural and Floor are left out, because their boxes hold most of the plant.

Proposed thresholds (owner to decide): `iou_min = 0.5`, `contain_min = 0.8`. On the 13 % sample the smallest IoU between an object's run 1 box and its sampled box is 0.625, so 0.5 leaves a margin. At 0.7 and above, unchanged objects start to fail.

## Consequences

- Unchanged objects, class changes, splits and merges are found almost always (table in the report).
- **Weak point: small objects inside large boxes.** A bent pipe's box is mostly empty space (object 221: 7.9 × 1.5 × 1.5 m). When a flange next to it is removed, the flange's old box sits inside the pipe's box and reads as a merge. A new box landing inside reads as a split. About 1 in 5 removals and 1 in 7 additions go wrong this way, and each takes one unchanged object with it.
- That failure is safe under the proposed product rules in PRD T13: split and merged objects never inherit a decision, so a false merge sends both objects back to the review queue. It costs review time; it does not carry a wrong decision forward.
- The numbers come from our own scripted changes and from sampled geometry, not from a real model's output.
