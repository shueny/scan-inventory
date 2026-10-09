import sys
from datetime import date
from pathlib import Path

import laspy
import numpy as np
import pytest
from plyfile import PlyData, PlyElement

from export_las import RandomSampler, VoxelSampler, export, main
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


# ---------------------------------------------------------------- bad input (T2 verification D3-D9)


def write_points(path: Path, instance: list[float], label: list[float]) -> None:
    """A tiny PLY with one point per (instance, label) pair, all at different places."""
    rows = [
        (i, 0, 0, 100, 150, 200, c, iid)
        for i, (iid, c) in enumerate(zip(instance, label, strict=True))
    ]
    dtype = [
        ("x", "f4"), ("y", "f4"), ("z", "f4"),
        ("red", "u1"), ("green", "u1"), ("blue", "u1"),
        ("scalar_label", "f4"), ("scalar_instance", "f4"),
    ]  # fmt: skip
    PlyData([PlyElement.describe(np.array(rows, dtype=dtype), "vertex")]).write(str(path))


def run_main(monkeypatch: pytest.MonkeyPatch, *args: str) -> None:
    monkeypatch.setattr(sys, "argv", ["export_las.py", *args])
    main()


def test_output_bytes_do_not_depend_on_the_day(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    ply = tmp_path / "cloud.ply"
    write_ply(ply, CLOUD)

    class Tomorrow(date):
        @classmethod
        def today(cls) -> "Tomorrow":
            return cls(2030, 1, 2)

    export(ply, tmp_path / "a.las", "all", 1.0, 0.0)
    monkeypatch.setattr(laspy.header, "date", Tomorrow)  # laspy fills in date.today()
    export(ply, tmp_path / "b.las", "all", 1.0, 0.0)

    assert (tmp_path / "a.las").read_bytes() == (tmp_path / "b.las").read_bytes()


@pytest.mark.parametrize("bad_id", [70_000.0, -1.0])
def test_instance_id_outside_uint16_stops_with_a_message(tmp_path: Path, bad_id: float) -> None:
    ply = tmp_path / "cloud.ply"
    write_points(ply, instance=[5, bad_id], label=[1, 1])

    with pytest.raises(SystemExit, match="Instance id .* does not fit point_source_id"):
        export(ply, tmp_path / "out.las", "all", 1.0, 0.0)


@pytest.mark.parametrize("field", ["instance", "label"])
def test_nan_id_stops_instead_of_becoming_zero(tmp_path: Path, field: str) -> None:
    ply = tmp_path / "cloud.ply"
    ids = {"instance": [5.0, 5.0], "label": [1.0, 1.0]}
    ids[field][1] = float("nan")
    write_points(ply, **ids)

    with pytest.raises(SystemExit, match="not a number"):
        export(ply, tmp_path / "out.las", "all", 1.0, 0.0)


def test_failed_export_keeps_the_previous_file(tmp_path: Path) -> None:
    ply = tmp_path / "cloud.ply"
    write_points(ply, instance=[5, 6], label=[1, 300])  # class 300 does not fit uint8
    out = tmp_path / "out.las"
    out.write_bytes(b"previous good file")

    with pytest.raises(SystemExit, match="Class id"):
        export(ply, out, "all", 1.0, 0.0, chunk=1)  # fails in the 2nd chunk, after a write

    assert out.read_bytes() == b"previous good file"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["cloud.ply", "out.las"]  # no temp file


@pytest.mark.parametrize("size", ["nan", "inf", "0", "-1"])
def test_voxel_size_must_be_a_positive_finite_number(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, size: str
) -> None:
    ply = tmp_path / "cloud.ply"
    write_ply(ply, CLOUD)

    with pytest.raises(SystemExit, match="--voxel-size"):
        run_main(
            monkeypatch, "--ply", str(ply), "--out", str(tmp_path / "o.las"), "--voxel-size", size
        )


def test_empty_ply_stops_with_a_message(tmp_path: Path) -> None:
    ply = tmp_path / "empty.ply"
    write_points(ply, instance=[], label=[])

    with pytest.raises(SystemExit, match="no points"):
        export(ply, tmp_path / "out.las", "all", 1.0, 0.0)


def test_default_output_is_data_las_nora_las(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    ply = tmp_path / "cloud.ply"
    write_ply(ply, CLOUD)
    monkeypatch.chdir(tmp_path)

    run_main(monkeypatch, "--ply", str(ply))

    assert (tmp_path / "data" / "las" / "nora.las").exists()
    assert (tmp_path / "data" / "las" / "nora.stats.json").exists()
