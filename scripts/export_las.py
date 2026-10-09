"""
Export nora.ply to LAS 1.4 for PotreeConverter
----------------------------------------------
Streams the PLY in chunks and writes LAS 1.4, point format 7:
  - x, y, z        scale 0.0001 m, offset at the bounding-box minimum
  - red/green/blue 16-bit (uint8 x 257)
  - classification class id (scalar_label)
  - point_source_id instance id (scalar_instance), a standard field, no extra bytes

Optional deterministic sampling for the public demo build (default: all points):
  --sample 0.13        keep each point with probability 0.13 (fixed seed)
  --voxel-size 0.01    keep the first point in every 1 cm cube

The header date is fixed (CREATION_DATE), so the same input gives the same bytes on
any day. The file is written to `<out>.tmp` first and renamed only on success.

Usage (from the repo root):
    uv run --project scripts python scripts/export_las.py --out data/las/nora.las
    uv run --project scripts python scripts/export_las.py --out data/las/nora-random13.las \\
        --sample 0.13
"""

import argparse
import json
import math
import sys
import time
from datetime import date
from pathlib import Path
from typing import Any, Protocol

import laspy
import numpy as np
import numpy.typing as npt
from plyfile import PlyData

CHUNK = 2_000_000
SCALE = 0.0001
SEED = 20261008
MAX_POINT_SOURCE_ID = 65_535  # uint16
CREATION_DATE = date(2026, 10, 8)  # fixed, not today: same input -> same bytes

FloatArray = npt.NDArray[np.float64]
BoolArray = npt.NDArray[np.bool_]
IntArray = npt.NDArray[np.int64]


# ---------------------------------------------------------------- sampling


class Sampler(Protocol):
    def mask(self, xyz: FloatArray) -> BoolArray: ...


class KeepAll:
    def mask(self, xyz: FloatArray) -> BoolArray:
        return np.ones(len(xyz), dtype=bool)


class RandomSampler:
    """Keep each point with probability `fraction`. Same seed and chunk size -> same points."""

    def __init__(self, fraction: float, seed: int = SEED) -> None:
        self.fraction = fraction
        self.rng = np.random.default_rng(seed)

    def mask(self, xyz: FloatArray) -> BoolArray:
        return self.rng.random(len(xyz)) < self.fraction


class VoxelSampler:
    """Keep the first point (in file order) that falls into each cube of `size` metres.

    Spreads points evenly in space: dense areas lose many points, sparse areas few.
    Remembers which cubes are taken across chunks in one sorted array of cube keys.
    """

    def __init__(self, size: float, origin: FloatArray, extent: FloatArray) -> None:
        self.size = size
        self.origin = origin
        self.dims = (np.floor(extent / size).astype(np.int64) + 1).tolist()
        self.seen: IntArray = np.empty(0, dtype=np.int64)

    def keys(self, xyz: FloatArray) -> IntArray:
        ix, iy, iz = np.floor((xyz - self.origin) / self.size).astype(np.int64).T
        _, ny, nz = self.dims
        key: IntArray = (ix * ny + iy) * nz + iz
        return key

    def mask(self, xyz: FloatArray) -> BoolArray:
        keys = self.keys(xyz)
        uniq, first = np.unique(keys, return_index=True)  # first point of each cube in chunk
        taken = np.isin(uniq, self.seen, assume_unique=True)  # cube filled by an earlier chunk
        new_keys, new_first = uniq[~taken], first[~taken]
        self.seen = np.union1d(self.seen, new_keys)
        keep = np.zeros(len(xyz), dtype=bool)
        keep[new_first] = True
        return keep


# ---------------------------------------------------------------- LAS


def make_header(origin: FloatArray) -> laspy.LasHeader:
    header = laspy.LasHeader(point_format=7, version="1.4")
    header.scales = np.array([SCALE, SCALE, SCALE])
    header.offsets = origin
    header.creation_date = CREATION_DATE
    return header


def to_int_ids(values: FloatArray, name: str, top: int, field: str) -> IntArray:
    """PLY float ids -> integers. Stops on NaN/inf or on ids outside 0..top."""
    if not np.isfinite(values).all():
        sys.exit(f"{name} is not a number (NaN or inf) for some points")
    ids: IntArray = np.rint(values).astype(np.int64)
    if ids.min() < 0 or ids.max() > top:
        sys.exit(f"{name} {ids.min()}..{ids.max()} does not fit {field}")
    return ids


def read_ids(chunk: Any) -> tuple[IntArray, IntArray]:
    """Checked instance ids and class ids of one PLY chunk."""
    instance = to_int_ids(
        chunk["scalar_instance"], "Instance id", MAX_POINT_SOURCE_ID, "point_source_id"
    )
    label = to_int_ids(chunk["scalar_label"], "Class id", 255, "classification")
    return instance, label


def to_las_points(
    chunk: Any, instance: IntArray, label: IntArray, header: laspy.LasHeader
) -> laspy.ScaleAwarePointRecord:
    """One PLY chunk (structured array) and its checked ids -> LAS point record."""
    points = laspy.ScaleAwarePointRecord.zeros(len(chunk), header=header)
    points.x = chunk["x"].astype(np.float64)
    points.y = chunk["y"].astype(np.float64)
    points.z = chunk["z"].astype(np.float64)
    points.red = chunk["red"].astype(np.uint16) * 257
    points.green = chunk["green"].astype(np.uint16) * 257
    points.blue = chunk["blue"].astype(np.uint16) * 257
    points.classification = label.astype(np.uint8)
    points.point_source_id = instance.astype(np.uint16)
    return points


def bounds(vertices: Any, chunk: int) -> tuple[FloatArray, FloatArray]:
    """Min and max of x, y, z, one chunk at a time."""
    lo = np.full(3, np.inf)
    hi = np.full(3, -np.inf)
    for start in range(0, len(vertices), chunk):
        c = np.array(vertices[start : start + chunk])
        xyz = np.stack([c["x"], c["y"], c["z"]], axis=1).astype(np.float64)
        lo = np.minimum(lo, xyz.min(axis=0))
        hi = np.maximum(hi, xyz.max(axis=0))
    return lo, hi


def export(
    ply_path: Path, out: Path, method: str, fraction: float, voxel_size: float, chunk: int = CHUNK
) -> dict[str, Any]:
    vertices = PlyData.read(str(ply_path), mmap=True)["vertex"].data
    n = len(vertices)
    if n == 0:
        sys.exit(f"{ply_path} has no points")
    print(f"Pass 1/2: bounds of {n:,} points ...")
    lo, hi = bounds(vertices, chunk)

    sampler: Sampler
    if method == "random":
        sampler = RandomSampler(fraction)
    elif method == "voxel":
        sampler = VoxelSampler(voxel_size, lo, hi - lo)
    else:
        sampler = KeepAll()

    header = make_header(lo)
    kept_per_instance = np.zeros(MAX_POINT_SOURCE_ID + 1, np.int64)
    total_per_instance = np.zeros(MAX_POINT_SOURCE_ID + 1, np.int64)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.name + ".tmp")  # same folder, so the rename below is atomic
    t0 = time.time()
    print(f"Pass 2/2: writing {out} ({method}) ...")
    try:
        with laspy.open(tmp, mode="w", header=header) as writer:
            for start in range(0, n, chunk):
                c = np.array(vertices[start : start + chunk])
                xyz = np.stack([c["x"], c["y"], c["z"]], axis=1).astype(np.float64)
                keep = sampler.mask(xyz)
                instance, label = read_ids(c)
                total_per_instance += np.bincount(instance, minlength=len(total_per_instance))
                kept_per_instance += np.bincount(instance[keep], minlength=len(kept_per_instance))
                if keep.any():
                    writer.write_points(to_las_points(c[keep], instance[keep], label[keep], header))
                done = min(start + chunk, n)
                print(f"  {done / n:6.1%}  {time.time() - t0:5.0f} s", end="\r")
    except BaseException:  # also sys.exit and Ctrl+C: never leave a half-written file
        tmp.unlink(missing_ok=True)
        raise
    tmp.replace(out)
    print()

    present = np.flatnonzero(total_per_instance)
    ratio = kept_per_instance[present] / total_per_instance[present]
    smallest = present[np.argsort(total_per_instance[present])[:5]]
    return {
        "method": method,
        "fraction": fraction if method == "random" else None,
        "voxel_size_m": voxel_size if method == "voxel" else None,
        "seed": SEED if method == "random" else None,
        "input_points": int(n),
        "output_points": int(kept_per_instance.sum()),
        "output_bytes": out.stat().st_size,
        "instances": int(len(present)),
        "instances_lost": [int(i) for i in present[kept_per_instance[present] == 0]],
        "min_kept_points": int(kept_per_instance[present].min()),
        "kept_ratio_min_max": [round(float(ratio.min()), 4), round(float(ratio.max()), 4)],
        "smallest_instances": [
            {
                "instance_id": int(i),
                "points": int(total_per_instance[i]),
                "kept": int(kept_per_instance[i]),
            }
            for i in smallest
        ],  # fmt: skip
    }


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--ply", type=Path, default=Path("pointcloud/nora.ply"))
    p.add_argument("--out", type=Path, default=Path("data/las/nora.las"))
    sampling = p.add_mutually_exclusive_group()
    sampling.add_argument("--sample", type=float, help="random sampling: fraction to keep")
    sampling.add_argument("--voxel-size", type=float, help="voxel sampling: cube size in metres")
    args = p.parse_args()

    if not args.ply.exists():
        sys.exit(f"File not found: {args.ply}")
    if args.sample is not None and not 0 < args.sample <= 1:
        sys.exit("--sample must be in (0, 1]")
    if args.voxel_size is not None and not (math.isfinite(args.voxel_size) and args.voxel_size > 0):
        sys.exit("--voxel-size must be a positive number")
    method = "random" if args.sample else "voxel" if args.voxel_size else "all"

    t0 = time.time()
    stats = export(args.ply, args.out, method, args.sample or 1.0, args.voxel_size or 0.0)
    stats_path = args.out.with_suffix(".stats.json")
    stats_path.write_text(json.dumps(stats, indent=2) + "\n")
    print(json.dumps(stats, indent=2))
    print(f"Wrote {args.out} and {stats_path} in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
