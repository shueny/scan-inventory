import pytest

from match_runs import Box, Match, iou, match_runs


def box(
    i: int, lo: tuple[float, float, float], hi: tuple[float, float, float], cls: int = 1
) -> Box:
    return Box(i, cls, lo, hi)


# A pipe along x with a flange on it, and a valve one metre away.
PIPE = box(1, (0, 0, 0), (4, 0.2, 0.2), cls=8)
FLANGE = box(2, (1.9, -0.05, -0.05), (2.1, 0.25, 0.25), cls=23)
VALVE = box(3, (0, 1, 0), (0.4, 1.4, 0.4))


def test_iou_of_identical_disjoint_and_half_boxes() -> None:
    assert iou(VALVE, VALVE) == pytest.approx(1)
    assert iou(VALVE, PIPE) == 0
    assert iou(PIPE, box(9, (0, 0, 0), (2, 0.2, 0.2))) == pytest.approx(0.5)


def test_unchanged_objects_with_new_ids_are_the_same() -> None:
    new = [box(11, PIPE.bbox_min, PIPE.bbox_max, 8), box(12, FLANGE.bbox_min, FLANGE.bbox_max, 23)]

    assert set(match_runs([PIPE, FLANGE], new)) == {
        Match("same", (1,), (11,)),
        Match("same", (2,), (12,)),
    }


def test_small_shift_is_still_the_same_object() -> None:
    shifted = box(13, (0.02, 1.01, 0), (0.42, 1.41, 0.39))

    assert match_runs([VALVE], [shifted]) == [Match("same", (3,), (13,))]


def test_class_change_is_flagged() -> None:
    relabelled = box(13, VALVE.bbox_min, VALVE.bbox_max, cls=2)

    assert match_runs([VALVE], [relabelled]) == [Match("same", (3,), (13,), class_changed=True)]


def test_missing_and_new_objects_are_removed_and_added() -> None:
    far = box(20, (10, 10, 10), (11, 11, 11))

    assert set(match_runs([VALVE], [far])) == {
        Match("removed", (3,), ()),
        Match("added", (), (20,)),
    }


def test_pipe_split_in_two_next_to_its_flange() -> None:
    left = box(11, (0, 0, 0), (2.2, 0.2, 0.2), 8)  # IoU with the old pipe 0.55: paired first
    right = box(12, (2.2, 0, 0), (4, 0.2, 0.2), 8)
    flange = box(13, FLANGE.bbox_min, FLANGE.bbox_max, 23)

    assert set(match_runs([PIPE, FLANGE], [left, right, flange])) == {
        Match("split", (1,), (11, 12)),
        Match("same", (2,), (13,)),
    }


def test_two_neighbours_merged_into_one_box() -> None:
    a = box(1, (0, 0, 0), (1, 1, 1))
    b = box(2, (1, 0, 0), (2.2, 1, 1))
    union = box(11, (0, 0, 0), (2.2, 1, 1))

    assert match_runs([a, b], [union]) == [Match("merge", (1, 2), (11,))]


def test_box_that_shrank_a_lot_is_uncertain() -> None:
    small = box(13, (0.1, 1.1, 0.1), (0.25, 1.25, 0.25))  # inside the valve, IoU 0.05

    assert match_runs([VALVE], [small]) == [Match("uncertain", (3,), (13,))]


def test_every_box_is_used_exactly_once() -> None:
    old = [PIPE, FLANGE, VALVE]
    new = [
        box(11, (0, 0, 0), (2, 0.2, 0.2)),
        box(12, (2, 0, 0), (4, 0.2, 0.2)),
        box(14, (5, 5, 5), (6, 6, 6)),
    ]

    result = match_runs(old, new)

    assert sorted(i for m in result for i in m.old_ids) == [1, 2, 3]
    assert sorted(i for m in result for i in m.new_ids) == [11, 12, 14]


def test_empty_runs() -> None:
    assert match_runs([], [VALVE]) == [Match("added", (), (3,))]
    assert match_runs([VALVE], []) == [Match("removed", (3,), ())]
