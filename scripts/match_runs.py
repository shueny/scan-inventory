"""
Match the objects of two detection runs (T13 spike, ADR 0020)
-------------------------------------------------------------
Pure functions, no file access. Geometry only: each object is an axis-aligned
bounding box. Two overlap measures:

  IoU          intersection / union. High when two boxes are the same object.
  containment  intersection / volume of one box. High when that box sits inside
               the other, for example half of a pipe inside the whole pipe.

Steps:
  1. same      pairs whose IoU is at least iou_min and who are each other's best IoU
  2. split     unpaired new boxes inside one old box (plus that box's own partner,
               if the partner is inside it too): one old object became several
  3. merge     the mirror of 2: unpaired old boxes inside one new box
  4. uncertain one unpaired old box and one unpaired new box inside it, or the other
               way round: probably the same object, but its box changed too much
  5. removed / added: whatever is still unpaired
"""

from collections import defaultdict
from dataclasses import dataclass
from typing import Literal

import numpy as np
import numpy.typing as npt

Kind = Literal["same", "split", "merge", "uncertain", "removed", "added"]
Vec3 = tuple[float, float, float]
FloatArray = npt.NDArray[np.float64]


@dataclass(frozen=True)
class Box:
    id: int
    class_id: int
    bbox_min: Vec3
    bbox_max: Vec3


@dataclass(frozen=True)
class Match:
    kind: Kind
    old_ids: tuple[int, ...]
    new_ids: tuple[int, ...]
    class_changed: bool = False


def _corners(boxes: list[Box]) -> tuple[FloatArray, FloatArray]:
    lo = np.array([b.bbox_min for b in boxes], dtype=np.float64).reshape(-1, 3)
    hi = np.array([b.bbox_max for b in boxes], dtype=np.float64).reshape(-1, 3)
    return lo, hi


def overlap_matrices(old: list[Box], new: list[Box]) -> tuple[FloatArray, FloatArray, FloatArray]:
    """IoU, new-inside-old and old-inside-new, each shaped (len(old), len(new))."""
    olo, ohi = _corners(old)
    nlo, nhi = _corners(new)
    # A flat box (a thin plate) has zero volume; a floor of 1 mm per side keeps it countable.
    ovol = np.prod(np.maximum(ohi - olo, 1e-3), axis=1)
    nvol = np.prod(np.maximum(nhi - nlo, 1e-3), axis=1)
    side = np.minimum(ohi[:, None], nhi[None]) - np.maximum(olo[:, None], nlo[None])
    inter = np.prod(np.clip(side, 0, None), axis=2)
    union = ovol[:, None] + nvol[None] - inter
    return inter / union, inter / nvol[None], inter / ovol[:, None]


def iou(a: Box, b: Box) -> float:
    return float(overlap_matrices([a], [b])[0][0, 0])


def match_runs(
    old: list[Box], new: list[Box], iou_min: float = 0.5, contain_min: float = 0.8
) -> list[Match]:
    """Every old and every new box ends up in exactly one Match."""
    if not old or not new:
        return [Match("removed", (b.id,), ()) for b in old] + [
            Match("added", (), (b.id,)) for b in new
        ]
    iou_m, new_in_old, old_in_new = overlap_matrices(old, new)

    # 1. same: mutual best IoU above the threshold
    best_new = iou_m.argmax(axis=1)
    best_old = iou_m.argmax(axis=0)
    partner_of_old: dict[int, int] = {}
    for o, n in enumerate(best_new.tolist()):
        if best_old[n] == o and iou_m[o, n] >= iou_min:
            partner_of_old[o] = n
    partner_of_new = {n: o for o, n in partner_of_old.items()}
    free_old = {o for o in range(len(old)) if o not in partner_of_old}
    free_new = {n for n in range(len(new)) if n not in partner_of_new}

    def tightest(scores: FloatArray, volumes: FloatArray) -> int | None:
        """The box that holds this one best; ties go to the smallest box."""
        inside = np.flatnonzero(scores >= contain_min)
        if inside.size == 0:
            return None
        return int(min(inside.tolist(), key=lambda i: (-scores[i], volumes[i])))

    olo, ohi = _corners(old)
    nlo, nhi = _corners(new)
    ovol = np.prod(ohi - olo, axis=1)
    nvol = np.prod(nhi - nlo, axis=1)
    matches: list[Match] = []

    # 2. split: free new boxes grouped by the old box that holds them
    kids: dict[int, list[int]] = defaultdict(list)
    for n in sorted(free_new):
        holder = tightest(new_in_old[:, n], ovol)
        if holder is not None:
            kids[holder].append(n)
    for o, group in kids.items():
        partner = partner_of_old.get(o)
        members = list(group)
        if partner is not None and new_in_old[o, partner] >= contain_min:
            members.append(partner)
        if len(members) >= 2:
            if partner is not None and partner in members:
                del partner_of_old[o]
                del partner_of_new[partner]
            free_old.discard(o)
            free_new.difference_update(group)
            ids = tuple(sorted(new[n].id for n in members))
            matches.append(Match("split", (old[o].id,), ids))

    # 3. merge: free old boxes grouped by the new box that holds them
    parents: dict[int, list[int]] = defaultdict(list)
    for o in sorted(free_old):
        holder = tightest(old_in_new[o], nvol)
        if holder is not None and (holder in partner_of_new or holder in free_new):
            parents[holder].append(o)
    for n, group in parents.items():
        partner = partner_of_new.get(n)
        members = list(group)
        if partner is not None and old_in_new[partner, n] >= contain_min:
            members.append(partner)
        if len(members) >= 2:
            if partner is not None and partner in members:
                del partner_of_new[n]
                del partner_of_old[partner]
            free_new.discard(n)
            free_old.difference_update(group)
            ids = tuple(sorted(old[o].id for o in members))
            matches.append(Match("merge", ids, (new[n].id,)))

    # 4. uncertain: one free box inside one free box
    for o in sorted(free_old):
        holders = [n for n in free_new if max(new_in_old[o, n], old_in_new[o, n]) >= contain_min]
        if holders:
            n = max(holders, key=lambda k: iou_m[o, k])
            free_old.discard(o)
            free_new.discard(n)
            changed = old[o].class_id != new[n].class_id
            matches.append(Match("uncertain", (old[o].id,), (new[n].id,), changed))

    for o, n in partner_of_old.items():
        changed = old[o].class_id != new[n].class_id
        matches.append(Match("same", (old[o].id,), (new[n].id,), changed))

    # 5. leftovers
    matches += [Match("removed", (old[o].id,), ()) for o in sorted(free_old)]
    matches += [Match("added", (), (new[n].id,)) for n in sorted(free_new)]
    return matches
