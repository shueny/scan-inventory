"""
Measure every object again from a sampled LAS file (T13 spike)
--------------------------------------------------------------
Reads the LAS in chunks (instance id in point_source_id, class in classification)
and computes per object: point count, bounding box, centroid, and the PCA length
and diameter estimates of build_instances.py. The boxes differ from run 1 because
run 1 used all 151.9M points and a sample keeps only some of them.

Usage (from the repo root):
    uv run --project scripts python scripts/remeasure_run.py \\
        --las data/las/nora-random13.las --out data/spikes/t13/run2-random13.json
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import laspy
import numpy as np

from build_instances import CHUNK, MAX_ID, r4, shape_from_moments

MOMENT_KEYS = ("x", "y", "z", "xx", "yy", "zz", "xy", "xz", "yz")


def remeasure(las_path: Path, chunk: int = CHUNK) -> list[dict[str, Any]]:
    count = np.zeros(MAX_ID, np.int64)
    sums = {k: np.zeros(MAX_ID) for k in MOMENT_KEYS}
    mins = np.full((MAX_ID, 3), np.inf)
    maxs = np.full((MAX_ID, 3), -np.inf)
    class_of = np.full(MAX_ID, -1, np.int64)

    with laspy.open(las_path) as reader:
        for points in reader.chunk_iterator(chunk):
            ins = np.asarray(points.point_source_id, dtype=np.int64)
            if ins.size == 0:
                continue
            if ins.max() >= MAX_ID:
                sys.exit(f"Instance id {ins.max()} out of range. Raise MAX_ID.")
            x = np.asarray(points.x, dtype=np.float64)
            y = np.asarray(points.y, dtype=np.float64)
            z = np.asarray(points.z, dtype=np.float64)
            count += np.bincount(ins, minlength=MAX_ID)
            for key, arr in (
                ("x", x), ("y", y), ("z", z),
                ("xx", x * x), ("yy", y * y), ("zz", z * z),
                ("xy", x * y), ("xz", x * z), ("yz", y * z),
            ):  # fmt: skip
                sums[key] += np.bincount(ins, weights=arr, minlength=MAX_ID)
            xyz = np.stack([x, y, z], axis=1)
            np.minimum.at(mins, ins, xyz)
            np.maximum.at(maxs, ins, xyz)
            class_of[ins] = np.asarray(points.classification, dtype=np.int64)

    records = []
    for i in np.flatnonzero(count).tolist():
        k = int(count[i])
        mean, _, length, diameter = shape_from_moments(
            k, {key: float(sums[key][i]) for key in MOMENT_KEYS}
        )
        records.append(
            {
                "instance_id": i,
                "class_id": int(class_of[i]),
                "point_count": k,
                "centroid": [r4(c) for c in mean],
                "bbox_min": [r4(c) for c in mins[i]],
                "bbox_max": [r4(c) for c in maxs[i]],
                "length_est_m": r4(length),
                "diameter_est_m": r4(diameter),
            }
        )
    return records


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--las", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    if not args.las.exists():
        sys.exit(f"File not found: {args.las}")
    records = remeasure(args.las)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"source": str(args.las), "instances": records}, indent=2))
    print(f"Wrote {len(records)} objects to {args.out}")


if __name__ == "__main__":
    main()
