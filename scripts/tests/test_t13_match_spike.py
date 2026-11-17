from match_runs import Box, Match
from t13_match_spike import boxes_from, category, score


def test_category_separates_class_changes_from_unchanged() -> None:
    assert category(Match("same", (1,), (11,))) == "unchanged"
    assert category(Match("same", (1,), (11,), class_changed=True)) == "class changed"
    assert category(Match("split", (1,), (11, 12))) == "split"


def test_score_counts_exact_matches_only() -> None:
    truth = [
        Match("same", (1,), (11,)),
        Match("split", (2,), (12, 13)),
        Match("removed", (3,), ()),
    ]
    predicted = [
        Match("same", (1,), (11,)),
        Match("same", (2,), (12,)),  # half of the split found, so the split is missed
        Match("added", (), (13,)),
        Match("removed", (3,), ()),
    ]

    correct, total, missed = score(truth, predicted)

    assert dict(correct) == {"unchanged": 1, "removed": 1}
    assert dict(total) == {"unchanged": 1, "split": 1, "removed": 1}
    assert missed == [Match("split", (2,), (12, 13))]


def test_boxes_from_drops_structural_and_floor() -> None:
    records = [
        {"instance_id": 1, "class_id": 0, "bbox_min": [0, 0, 0], "bbox_max": [9, 9, 9]},
        {"instance_id": 2, "class_id": 8, "bbox_min": [0, 0, 0], "bbox_max": [1, 1, 1]},
        {"instance_id": 3, "class_id": 7, "bbox_min": [0, 0, 0], "bbox_max": [9, 9, 1]},
    ]

    assert boxes_from(records) == [Box(2, 8, (0, 0, 0), (1, 1, 1))]
