from pathlib import Path

import laspy
import numpy as np
import pytest

from remeasure_run import remeasure


def write_las(
    path: Path, xyz: list[tuple[float, float, float]], ids: list[int], cls: list[int]
) -> None:
    las = laspy.LasData(laspy.LasHeader(point_format=7, version="1.4"))
    las.header.scales = [0.0001] * 3
    las.header.offsets = [0, 0, 0]
    arr = np.array(xyz)
    las.x, las.y, las.z = arr[:, 0], arr[:, 1], arr[:, 2]
    las.point_source_id = np.array(ids, dtype=np.uint16)
    las.classification = np.array(cls, dtype=np.uint8)
    las.write(path)


def test_box_and_centroid_per_object_across_chunks(tmp_path: Path) -> None:
    path = tmp_path / "cloud.las"
    write_las(
        path,
        [(0, 0, 0), (1, 0, 0), (5, 5, 5), (2, 1, 1), (6, 5, 7)],
        ids=[1, 1, 2, 1, 2],
        cls=[8, 8, 1, 8, 1],
    )

    records = {r["instance_id"]: r for r in remeasure(path, chunk=2)}

    assert sorted(records) == [1, 2]
    pipe = records[1]
    assert (pipe["class_id"], pipe["point_count"]) == (8, 3)
    assert pipe["bbox_min"] == [0, 0, 0]
    assert pipe["bbox_max"] == [2, 1, 1]
    assert pipe["centroid"] == pytest.approx([1, 1 / 3, 1 / 3], abs=1e-4)
    assert records[2]["bbox_max"] == [6, 5, 7]
