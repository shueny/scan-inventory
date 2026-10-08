from pathlib import Path

import laspy
import numpy as np
import pytest

from export_las import RandomSampler, VoxelSampler, export
from tests.test_build_instances import CLOUD, write_ply


def test_las_round_trip_keeps_coordinates_colour_class_and_instance(tmp_path: Path) -> None:
    ply = tmp_path / "cloud.ply"
    write_ply(ply, CLOUD)
    out = tmp_path / "cloud.las"

    stats = export(ply, out, "all", 1.0, 0.0, chunk=5)

    las = laspy.read(out)
    assert las.header.version == "1.4"
    assert las.header.point_format.id == 7
    assert np.allclose(las.header.offsets, [0, 0, 0])  # bbox minimum of CLOUD
    assert np.allclose(las.header.scales, 0.0001)
    assert len(las.points) == stats["output_points"] == 12

    valve = las.point_source_id == 1
    assert valve.sum() == 3
    assert set(las.classification[valve]) == {1}
    assert np.allclose(np.c_[las.x, las.y, las.z][valve], [(1, 1, 1), (1, 1, 2), (2, 1, 1)])
    assert set(las.red) == {100 * 257}  # uint8 colour scaled to 16 bit
    assert set(las.point_source_id) == {0, 1, 2, 3}
    assert set(las.classification) == {1, 7, 8, 17}


def test_random_sampler_is_deterministic_and_close_to_fraction() -> None:
    xyz = np.zeros((100_000, 3))

    a = RandomSampler(0.13).mask(xyz)
    b = RandomSampler(0.13).mask(xyz)

    assert np.array_equal(a, b)
    assert a.mean() == pytest.approx(0.13, abs=0.01)


def test_voxel_sampler_keeps_one_point_per_cube_across_chunks() -> None:
    origin, extent = np.zeros(3), np.array([1.0, 1.0, 1.0])
    sampler = VoxelSampler(0.5, origin, extent)
    chunk1 = np.array([[0.1, 0.1, 0.1], [0.2, 0.2, 0.2], [0.9, 0.1, 0.1]])  # cubes A, A, B
    chunk2 = np.array([[0.3, 0.3, 0.3], [0.9, 0.9, 0.9]])  # cube A again, new cube C

    assert sampler.mask(chunk1).tolist() == [True, False, True]
    assert sampler.mask(chunk2).tolist() == [False, True]


def test_export_reports_lost_instances(tmp_path: Path) -> None:
    ply = tmp_path / "cloud.ply"
    write_ply(ply, CLOUD)

    # one 100 m cube: only the very first point (floor, instance 0) survives
    stats = export(ply, tmp_path / "s.las", "voxel", 1.0, 100.0)

    assert stats["output_points"] == 1
    assert stats["instances_lost"] == [1, 2, 3]
