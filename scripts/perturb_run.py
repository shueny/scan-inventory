"""
Scripted changes that turn one run into a fake second run (T13 spike)
---------------------------------------------------------------------
Pure function, fixed seed. Applies the changes listed in PRD T13 and returns the
true answer next to the new run, so the matcher can be scored:

  - every object gets a new id (a new model run never reuses ids)
  - some objects change class
  - some objects are removed, some new ones are added
  - one pipe is split in two along its longest side
  - two neighbouring objects are merged into one box
"""

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from match_runs import Box, Kind, Match, Vec3

NEW_ID_START = 10_000


@dataclass(frozen=True)
class Changes:
    class_changes: int = 10
    removed: int = 5
    added: int = 5
    pipe_class_id: int = 8
    min_pipe_length_m: float = 1.0


DEFAULT_CHANGES = Changes()


def _vec(a: npt.ArrayLike) -> Vec3:
    x, y, z = (float(v) for v in np.asarray(a, dtype=np.float64))
    return (x, y, z)


def perturb(
    boxes: list[Box], seed: int, changes: Changes = DEFAULT_CHANGES
) -> tuple[list[Box], list[Match]]:
    """Return (new run, true matches). True matches use the old ids and the new ids."""
    rng = np.random.default_rng(seed)
    by_id = {b.id: b for b in boxes}
    untouched = set(by_id)
    # Each entry: (kind, old ids, boxes of the new run, class changed).
    events: list[tuple[Kind, tuple[int, ...], list[Box], bool]] = []

    def take(candidates: list[int], k: int) -> list[int]:
        picked = rng.choice(sorted(candidates), size=min(k, len(candidates)), replace=False)
        chosen = [int(i) for i in picked]
        untouched.difference_update(chosen)
        return chosen

    # Split: one long pipe, cut at a random point along its longest side.
    pipes = [
        b.id
        for b in boxes
        if b.class_id == changes.pipe_class_id
        and max(np.subtract(b.bbox_max, b.bbox_min)) >= changes.min_pipe_length_m
    ]
    for pid in take(pipes, 1):
        b = by_id[pid]
        lo, hi = np.array(b.bbox_min), np.array(b.bbox_max)
        axis = int(np.argmax(hi - lo))
        cut = lo[axis] + rng.uniform(0.3, 0.7) * (hi[axis] - lo[axis])
        hi_a, lo_b = hi.copy(), lo.copy()
        hi_a[axis] = lo_b[axis] = cut
        halves = [
            Box(-1, b.class_id, b.bbox_min, _vec(hi_a)),
            Box(-1, b.class_id, _vec(lo_b), b.bbox_max),
        ]
        events.append(("split", (pid,), halves, False))

    # Merge: a random object and its nearest neighbour (centroid distance) become one box.
    for aid in take(sorted(untouched), 1):
        a = by_id[aid]
        centre = (np.array(a.bbox_min) + np.array(a.bbox_max)) / 2
        others = sorted(untouched)
        dist = [
            float(np.linalg.norm((np.array(by_id[i].bbox_min) + by_id[i].bbox_max) / 2 - centre))
            for i in others
        ]
        bid = others[int(np.argmin(dist))]
        untouched.discard(bid)
        b = by_id[bid]
        union = Box(
            -1,
            a.class_id,
            _vec(np.minimum(a.bbox_min, b.bbox_min)),
            _vec(np.maximum(a.bbox_max, b.bbox_max)),
        )
        events.append(("merge", (aid, bid), [union], False))

    for rid in take(sorted(untouched), changes.removed):
        events.append(("removed", (rid,), [], False))

    class_ids = sorted({b.class_id for b in boxes})
    for cid in take(sorted(untouched), changes.class_changes):
        b = by_id[cid]
        new_class = int(rng.choice([c for c in class_ids if c != b.class_id]))
        events.append(("same", (cid,), [Box(-1, new_class, b.bbox_min, b.bbox_max)], True))

    for i in sorted(untouched):
        events.append(("same", (i,), [by_id[i]], False))

    # Added: the size of a random existing object, at a random place inside the plant.
    lo_all = np.min([b.bbox_min for b in boxes], axis=0)
    hi_all = np.max([b.bbox_max for b in boxes], axis=0)
    for _ in range(changes.added):
        template = by_id[int(rng.choice(sorted(by_id)))]
        size = np.subtract(template.bbox_max, template.bbox_min)
        start = lo_all + rng.uniform(0, 1, 3) * np.maximum(hi_all - lo_all - size, 0)
        events.append(
            ("added", (), [Box(-1, template.class_id, _vec(start), _vec(start + size))], False)
        )

    # New ids, in a random order so they say nothing about the old ids.
    count = sum(len(new) for _, _, new, _ in events)
    fresh = iter((NEW_ID_START + rng.permutation(count)).tolist())
    new_run: list[Box] = []
    truth: list[Match] = []
    for kind, old_ids, new_boxes, changed in events:
        renamed = [Box(next(fresh), b.class_id, b.bbox_min, b.bbox_max) for b in new_boxes]
        new_run += renamed
        new_ids = tuple(sorted(b.id for b in renamed))
        truth.append(Match(kind, tuple(sorted(old_ids)), new_ids, changed))
    new_run.sort(key=lambda b: b.id)
    return new_run, truth
