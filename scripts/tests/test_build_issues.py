from build_issues import (
    build_issues,
    class_mismatch,
    estimate_unreliable,
    tag_missing_in_scan,
    tag_split,
    untagged_equipment,
    zone_borrowed,
)
from tests.factories import make_record, make_row

CLASSES = {1: "Manual wheel valve", 2: "Manual lever valve", 4: "Transmitter", 8: "Pipe",
           12: "Pressure safety valve", 20: "Piping components", 22: "Small manual valve",
           23: "Pipeline flanged joint"}  # fmt: skip


# ---------------------------------------------------------------- class_mismatch


def test_class_mismatch_flags_wrong_class_and_suggests_the_mapped_one() -> None:
    rows = [make_row("PSV-1", "safety valve", (1,), nominal_inch=1.0)]
    instances = {1: make_record(1, class_id=20, class_name="Piping components")}

    issues, unmapped = class_mismatch(rows, instances, CLASSES)

    assert unmapped == set()
    [issue] = issues
    assert issue.issue_id == "class_mismatch:1"
    assert issue.severity == "high"
    assert issue.tags == ["PSV-1"]
    assert issue.title == "P&ID says safety valve, annotation says Piping components"
    assert (issue.suggested_action, issue.suggested_class_id) == ("change_class", 12)


def test_class_mismatch_ignores_matching_class() -> None:
    rows = [make_row("VBT-1", "ball valve", (1,))]
    instances = {1: make_record(1, class_id=22)}

    assert class_mismatch(rows, instances, CLASSES)[0] == []


def test_class_mismatch_small_ball_valve_annotated_as_pipe() -> None:
    rows = [make_row("VBT-1", "ball valve", (169,), nominal_inch=0.5)]
    instances = {169: make_record(169, class_id=8, class_name="Pipe")}

    [issue] = class_mismatch(rows, instances, CLASSES)[0]

    assert issue.suggested_class_id == 22


def test_class_mismatch_skips_and_reports_unmapped_element() -> None:
    rows = [make_row("X-1", "flux capacitor", (1,))]

    issues, unmapped = class_mismatch(rows, {1: make_record(1)}, CLASSES)

    assert issues == []
    assert unmapped == {"flux capacitor"}


# ---------------------------------------------------------------- tag_missing_in_scan


def test_tag_missing_in_scan_only_for_rows_without_instance() -> None:
    rows = [make_row("PT-1", "transmitter", ()), make_row("V-1", "gate valve", (5,))]

    [issue] = tag_missing_in_scan(rows)

    assert (issue.issue_id, issue.severity, issue.instance_ids) == (
        "tag_missing_in_scan:PT-1",
        "medium",
        [],
    )


# ---------------------------------------------------------------- untagged_equipment


def test_untagged_equipment_skips_background_pipes_flanges_and_tagged() -> None:
    instances = {
        1: make_record(1, class_id=0, is_background=True),
        2: make_record(2, class_id=8),
        3: make_record(3, class_id=23),
        4: make_record(4, class_id=1, has_tag=True, tag="V-1"),
        5: make_record(5, class_id=1, class_name="Manual wheel valve"),
    }

    [issue] = untagged_equipment([], instances)

    assert issue.issue_id == "untagged_equipment:5"
    assert issue.suggested_action == "assign_tag"
    assert issue.candidate_tags == []


def test_untagged_transmitter_gets_candidates_ranked_by_distance_to_same_system() -> None:
    rows = [
        make_row("PT-FAR", "transmitter", (), system="SYS - A"),
        make_row("PT-NEAR", "transmitter", (), system="SYS - B"),
        make_row("PT-NOSYS", "transmitter", (), system="SYS - C"),  # nothing in the scan
        make_row("PT-LINKED", "transmitter", (9,), system="SYS - B"),  # already has an object
    ]
    instances = {
        1: make_record(1, class_id=4, class_name="Transmitter", centroid=[0, 0, 0]),
        2: make_record(2, has_tag=True, system="SYS - A", centroid=[10, 0, 0]),
        3: make_record(3, has_tag=True, system="SYS - B", centroid=[0, 3, 4]),
    }

    [issue] = untagged_equipment(rows, instances)

    assert issue.candidate_tags == [
        {"tag": "PT-NEAR", "system": "SYS - B", "distance_m": 5.0},
        {"tag": "PT-FAR", "system": "SYS - A", "distance_m": 10.0},
        {"tag": "PT-NOSYS", "system": "SYS - C", "distance_m": None},
    ]


# ---------------------------------------------------------------- tag_split


def test_tag_split_when_one_tag_has_several_instances() -> None:
    rows = [make_row("P-1", "water pump", (177, 175)), make_row("V-1", "gate valve", (3,))]
    instances = {175: make_record(175, class_name="Motor"), 177: make_record(177)}

    [issue] = tag_split(rows, instances)

    assert (issue.issue_id, issue.severity, issue.instance_ids) == (
        "tag_split:P-1",
        "low",
        [175, 177],
    )


# ---------------------------------------------------------------- estimate_unreliable


def test_estimate_unreliable_for_thick_pipes_only() -> None:
    instances = {
        1: make_record(1, class_id=8, diameter_est_m=0.31),
        2: make_record(2, class_id=8, diameter_est_m=0.3),  # at the limit: still fine
        3: make_record(3, class_id=1, diameter_est_m=0.9),  # not a pipe
    }

    assert [i.issue_id for i in estimate_unreliable(instances)] == ["estimate_unreliable:1"]


# ---------------------------------------------------------------- zone_borrowed


def test_zone_borrowed_only_for_tagged_objects() -> None:
    instances = {
        1: make_record(1, has_tag=True, tag="PVE-1", location_source="tagged_nearest_tag"),
        2: make_record(2, location_source="nearest_tag"),
        3: make_record(3, has_tag=True, tag="V-1", location_source="pnid"),
    }

    [issue] = zone_borrowed(instances)

    assert (issue.issue_id, issue.tags) == ("zone_borrowed:1", ["PVE-1"])


# ---------------------------------------------------------------- pipeline


def test_build_issues_sorted_high_to_low_severity() -> None:
    records = [
        make_record(1, class_id=8, diameter_est_m=0.5),  # low
        make_record(2, class_id=20, class_name="Piping components", has_tag=True, tag="PSV-1"),
        make_record(3, class_id=1),  # untagged equipment, medium
    ]
    rows = [make_row("PSV-1", "safety valve", (2,))]

    issues, _ = build_issues(records, rows, CLASSES)

    assert [i.severity for i in issues] == ["high", "medium", "low"]
