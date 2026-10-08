import json
from pathlib import Path

import numpy as np
import pytest
from plyfile import PlyData, PlyElement

from build_instances import assign_zones, build, shape_from_moments, write_outputs
from tests.factories import make_record

Cloud = dict[int, tuple[int, list[tuple[float, float, float]]]]

# instance id -> (class id, points). Small enough to check by hand.
CLOUD: Cloud = {
    0: (7, [(0, 0, 0), (10, 0, 0), (10, 10, 0), (0, 10, 0)]),  # floor, background
    1: (1, [(1, 1, 1), (1, 1, 2), (2, 1, 1)]),  # valve, tagged, P&ID zone NW
    2: (17, [(9, 9, 1), (9, 9, 3)]),  # vessel, tagged, P&ID has no zone
    3: (8, [(8, 8, 1), (8, 9, 1), (8, 10, 1)]),  # pipe, untagged
}


def write_ply(path: Path, cloud: Cloud) -> None:
    rows = [
        (x, y, z, 100, 150, 200, float(cls), float(iid))
        for iid, (cls, pts) in cloud.items()
        for x, y, z in pts
    ]
    dtype = [
        ("x", "f4"), ("y", "f4"), ("z", "f4"),
        ("red", "u1"), ("green", "u1"), ("blue", "u1"),
        ("scalar_label", "f4"), ("scalar_instance", "f4"),
    ]  # fmt: skip
    PlyData([PlyElement.describe(np.array(rows, dtype=dtype), "vertex")]).write(str(path))


@pytest.fixture
def meta(tmp_path: Path) -> Path:
    d = tmp_path / "meta"
    d.mkdir()
    (d / "classes.json").write_text(
        json.dumps({"1": "Manual wheel valve", "7": "Floor", "8": "Pipe", "17": "Tank/Vessel"})
    )
    (d / "pnid_composition.csv").write_text(
        "TAG,TAG Simplified,Element,Dimension,Spool colour,Location,System,Instance ID\n"
        'VG-1,VG,gate valve,2",,NW,SYS - 1,1\n'
        "PVE-1,PVE,pressure vessel,,,,SYS - 2,2\n"
        "PT-9,PT,transmitter,,,SE,SYS - 3,\n"
    )
    return d


def test_build_on_synthetic_cloud(tmp_path: Path, meta: Path) -> None:
    ply = tmp_path / "cloud.ply"
    write_ply(ply, CLOUD)

    # chunk=5 forces several chunks so the per-chunk merge of sums and boxes is exercised
    records, missing, summary = build(ply, meta, scan_id="test", chunk=5)
    by_id = {r["instance_id"]: r for r in records}

    assert summary["total_points"] == 12
    assert [r["instance_id"] for r in records] == [0, 1, 2, 3]
    assert all(r["scan_id"] == "test" for r in records)

    valve = by_id[1]
    assert valve["point_count"] == 3
    assert valve["bbox_min"] == [1.0, 1.0, 1.0]
    assert valve["bbox_max"] == [2.0, 1.0, 2.0]
    assert valve["centroid"] == pytest.approx([4 / 3, 1.0, 4 / 3], abs=1e-4)
    assert (valve["tag"], valve["all_tags"], valve["has_tag"]) == ("VG-1", ["VG-1"], True)
    assert (valve["location"], valve["location_source"]) == ("NW", "pnid")
    assert valve["nominal_inch"] == 2.0

    assert by_id[0]["is_background"] and by_id[0]["location_source"] == "background"
    assert (by_id[2]["location"], by_id[2]["location_source"]) == ("NW", "tagged_nearest_tag")
    assert (by_id[3]["location"], by_id[3]["location_source"]) == ("NW", "nearest_tag")
    assert by_id[3]["has_tag"] is False

    assert [t.tag for t in missing] == ["PT-9"]
    assert summary["tags_without_instance"] == ["PT-9"]
    assert summary["class_conflicts"] == []


def test_class_conflict_is_detected_across_chunks(tmp_path: Path, meta: Path) -> None:
    # instance 4 has one point labelled valve (index 12) and one labelled pipe (index 13)
    ply = tmp_path / "cloud.ply"
    write_ply(ply, {**CLOUD, 4: (1, [(5, 5, 5)])})
    data = PlyData.read(str(ply))["vertex"].data
    extra = np.array([(5, 5, 6, 0, 0, 0, 8.0, 4.0)], dtype=data.dtype)
    PlyData([PlyElement.describe(np.concatenate([data, extra]), "vertex")]).write(str(ply))

    # chunk=13 puts the two points of instance 4 in different chunks
    _, _, summary = build(ply, meta, chunk=13)

    assert summary["class_conflicts"] == [4]


def test_length_of_straight_line_of_points() -> None:
    # 1001 points evenly spread on a 2 m line along x
    x = np.linspace(0, 2, 1001)
    s = {
        "x": x.sum(), "y": 0.0, "z": 0.0,
        "xx": (x * x).sum(), "yy": 0.0, "zz": 0.0, "xy": 0.0, "xz": 0.0, "yz": 0.0,
    }  # fmt: skip
    _, axis, length, diameter = shape_from_moments(len(x), s)

    assert length == pytest.approx(2.0, rel=0.01)
    assert diameter == pytest.approx(0.0, abs=1e-6)
    assert abs(axis[0]) == pytest.approx(1.0)


def test_assign_zones_uses_nearest_zoned_object_in_plan_view() -> None:
    records = [
        make_record(1, centroid=[0, 0, 0], location="NW", location_source="pnid", tag="A"),
        make_record(2, centroid=[10, 0, 0], location="NE", location_source="pnid", tag="B"),
        # closer to B in plan view even though far away in z
        make_record(3, centroid=[9, 0, 50], location=None, location_source=None),
    ]
    assign_zones(records)

    assert records[2]["location"] == "NE"
    assert records[2]["nearest_tag"] == "B"
    assert records[2]["nearest_tag_distance_m"] == 1.0


def test_same_input_gives_identical_output(tmp_path: Path, meta: Path) -> None:
    ply = tmp_path / "cloud.ply"
    write_ply(ply, CLOUD)

    outputs = []
    for run in ("a", "b"):
        write_outputs(tmp_path / run, *build(ply, meta, chunk=5))
        outputs.append((tmp_path / run / "instances.json").read_bytes())

    assert outputs[0] == outputs[1]
