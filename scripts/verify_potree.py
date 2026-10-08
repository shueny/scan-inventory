"""
Check Potree tiles against the LAS they were built from
-------------------------------------------------------
Decodes octree.bin (uncompressed Potree 2.0) and compares, per instance id
(`point source id`), the number of points and the class with the LAS file.
Both files are read in chunks, so this works on the full 3 GB tiles.

Usage (from the repo root):
    uv run --project scripts python scripts/verify_potree.py data/las/nora.las data/potree/nora
"""

import json
import sys
from pathlib import Path
from typing import Any

import laspy
import numpy as np
import numpy.typing as npt

CHUNK = 5_000_000
MAX_ID = 65_536
NUMPY_TYPES = {"int32": "<i4", "uint16": "<u2", "uint8": "u1"}

IntArray = npt.NDArray[np.int64]


def octree_dtype(metadata: dict[str, Any]) -> np.dtype[Any]:
    """Byte layout of one point, from the attribute list in metadata.json."""
    fields: list[Any] = []
    for a in metadata["attributes"]:
        if a["name"] == "position":
            fields.append(("position", "<i4", (3,)))
        elif a["name"] == "rgb":
            fields.append(("rgb", "<u2", (3,)))
        else:
            fields.append((a["name"], NUMPY_TYPES[a["type"]]))
    return np.dtype(fields)


def tally(instance: Any, cls: Any, counts: IntArray, pairs: set[int]) -> None:
    ids = np.asarray(instance).astype(np.int64)
    counts += np.bincount(ids, minlength=MAX_ID)
    pairs.update(np.unique(ids * 256 + np.asarray(cls)).tolist())


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    las_path, tiles = Path(sys.argv[1]), Path(sys.argv[2])
    metadata = json.loads((tiles / "metadata.json").read_text())
    if metadata["encoding"] != "DEFAULT":
        sys.exit(f"Only uncompressed tiles can be checked, got {metadata['encoding']}")

    octree = np.memmap(tiles / "octree.bin", dtype=octree_dtype(metadata), mode="r")
    tile_counts, tile_pairs = np.zeros(MAX_ID, np.int64), set[int]()
    for start in range(0, len(octree), CHUNK):
        c = octree[start : start + CHUNK]
        tally(c["point source id"], c["classification"], tile_counts, tile_pairs)

    las_counts, las_pairs = np.zeros(MAX_ID, np.int64), set[int]()
    with laspy.open(las_path) as reader:
        for points in reader.chunk_iterator(CHUNK):
            tally(points.point_source_id, points.classification, las_counts, las_pairs)

    same_counts = bool(np.array_equal(las_counts, tile_counts))
    same_pairs = las_pairs == tile_pairs
    print(f"points in tiles:              {len(octree):,} (metadata says {metadata['points']:,})")
    print(f"points per instance match:    {same_counts}")
    print(f"(instance, class) pairs match: {same_pairs} ({len(tile_pairs)} pairs)")
    if not (same_counts and same_pairs and len(octree) == metadata["points"]):
        sys.exit(1)


if __name__ == "__main__":
    main()
