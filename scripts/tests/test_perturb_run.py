import numpy as np

from match_runs import Box, match_runs
from perturb_run import NEW_ID_START, Changes, perturb


def grid_plant() -> list[Box]:
    """30 valves on a 1 m grid, plus three 3 m pipes far from them."""
    boxes = [
        Box(i, 1 + i % 3, (x, y, 0.0), (x + 0.4, y + 0.4, 0.4))
        for i, (x, y) in enumerate((float(x), float(y)) for x in range(6) for y in range(5))
    ]
    boxes += [Box(100 + k, 8, (0.0, 10.0 + k, 0.0), (3.0, 10.2 + k, 0.2)) for k in range(3)]
    return boxes


def test_same_seed_gives_the_same_run() -> None:
    assert perturb(grid_plant(), seed=3) == perturb(grid_plant(), seed=3)
    assert perturb(grid_plant(), seed=3) != perturb(grid_plant(), seed=4)


def test_truth_covers_every_old_and_new_box_once() -> None:
    plant = grid_plant()

    new, truth = perturb(plant, seed=0)

    assert sorted(i for m in truth for i in m.old_ids) == sorted(b.id for b in plant)
    assert sorted(i for m in truth for i in m.new_ids) == sorted(b.id for b in new)
    assert all(b.id >= NEW_ID_START for b in new)


def test_counts_of_each_change() -> None:
    _, truth = perturb(grid_plant(), seed=1, changes=Changes(class_changes=4, removed=2, added=3))

    kinds = [(m.kind, m.class_changed) for m in truth]
    assert kinds.count(("split", False)) == 1
    assert kinds.count(("merge", False)) == 1
    assert kinds.count(("removed", False)) == 2
    assert kinds.count(("added", False)) == 3
    assert kinds.count(("same", True)) == 4


def test_split_halves_rebuild_the_pipe() -> None:
    plant = grid_plant()
    new, truth = perturb(plant, seed=2)
    by_id = {b.id: b for b in new}

    [split] = [m for m in truth if m.kind == "split"]
    [pipe] = [b for b in plant if b.id == split.old_ids[0]]
    halves = [by_id[i] for i in split.new_ids]
    assert np.allclose(np.min([h.bbox_min for h in halves], axis=0), pipe.bbox_min)
    assert np.allclose(np.max([h.bbox_max for h in halves], axis=0), pipe.bbox_max)


def test_matcher_recovers_unchanged_and_class_changed_objects() -> None:
    plant = grid_plant()
    new, truth = perturb(plant, seed=5)

    found = set(match_runs(plant, new))

    same = [m for m in truth if m.kind == "same"]
    assert all(m in found for m in same)
