"""
Build the object inventory for scan-inventory
---------------------------------------------
Reads nora.ply in chunks and computes one record per annotated object
(instance), then joins the class names and the P&ID tag table.

Per instance:
  - class id and name, point count, centroid, bounding box
  - principal axis, rough length and diameter estimates (PCA based)
  - mean colour
  - P&ID tag, element type, nominal size, system, location (zone)

Objects without a P&ID zone get the zone of the nearest object that has one.
Structural and Floor are marked as background. Output schema: docs/data-schema.md

Usage (from the repo root):
    uv run --project scripts python scripts/build_instances.py
    uv run --project scripts python scripts/build_instances.py \\
        --ply pointcloud/nora.ply --meta meta --out data

Outputs:
    data/instances.json   full records + summary + P&ID tags missing in the scan
    data/instances.csv    flat table, easy to open in a spreadsheet
"""

import argparse
import csv
import json
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
from plyfile import PlyData

from pnid import PnidRow, load_pnid

CHUNK = 2_000_000
MAX_ID = 4096  # upper bound for instance ids, checked at runtime
BACKGROUND_CLASSES = {0, 7}  # Structural, Floor
SUM_KEYS = ("x", "y", "z", "xx", "yy", "zz", "xy", "xz", "yz", "r", "g", "b")
DEFAULT_SCAN_ID = "nora"

Record = dict[str, Any]
FloatArray = npt.NDArray[np.float64]
IntArray = npt.NDArray[np.int64]


# ---------------------------------------------------------------- helpers


def r4(value: float | np.floating[Any] | None) -> float | None:
    return None if value is None else round(float(value), 4)


def load_classes(path: Path) -> dict[int, str]:
    with open(path, encoding="utf-8") as f:
        return {int(k): v for k, v in json.load(f).items()}


def group_by_instance(rows: list[PnidRow]) -> dict[int, list[PnidRow]]:
    """{instance_id: [P&ID rows pointing to it]}, rows kept in file order."""
    by_instance: dict[int, list[PnidRow]] = {}
    for row in rows:
        for i in row.instance_ids:
            by_instance.setdefault(i, []).append(row)
    return by_instance


# ---------------------------------------------------------------- pass over the point cloud


@dataclass
class Accumulated:
    """Per-instance sums collected in one pass over the points (index = instance id)."""

    total_points: int
    count: IntArray
    sums: dict[str, FloatArray]
    mins: FloatArray
    maxs: FloatArray
    class_of: IntArray
    conflicts: set[int]  # instances whose points carry more than one class


def accumulate(ply_path: Path, chunk: int = CHUNK) -> Accumulated:
    ply = PlyData.read(str(ply_path), mmap=True)
    v = ply["vertex"].data
    n = len(v)

    count = np.zeros(MAX_ID, np.int64)
    sums = {k: np.zeros(MAX_ID) for k in SUM_KEYS}
    mins = np.full((MAX_ID, 3), np.inf)
    maxs = np.full((MAX_ID, 3), -np.inf)
    class_of = np.full(MAX_ID, -1, np.int64)
    conflicts: set[int] = set()

    t0 = time.time()
    print(f"Reading {n:,} points in chunks of {chunk:,} ...")
    for start in range(0, n, chunk):
        c = np.array(v[start : start + chunk])  # only this chunk in RAM
        ins = np.rint(c["scalar_instance"]).astype(np.int64)
        lab = np.rint(c["scalar_label"]).astype(np.int64)
        if ins.min() < 0 or ins.max() >= MAX_ID:
            sys.exit(f"Instance id out of range: {ins.min()}..{ins.max()}. Raise MAX_ID.")

        x = c["x"].astype(np.float64)
        y = c["y"].astype(np.float64)
        z = c["z"].astype(np.float64)

        # sums per instance (bincount is a fast group-by-sum)
        count += np.bincount(ins, minlength=MAX_ID)
        for key, arr in (
            ("x", x),
            ("y", y),
            ("z", z),
            ("xx", x * x),
            ("yy", y * y),
            ("zz", z * z),
            ("xy", x * y),
            ("xz", x * z),
            ("yz", y * z),
            ("r", c["red"]),
            ("g", c["green"]),
            ("b", c["blue"]),
        ):
            sums[key] += np.bincount(ins, weights=arr, minlength=MAX_ID)

        # min / max per instance: sort by id, then reduce each group
        order = np.argsort(ins, kind="stable")
        s_ins = ins[order]
        starts = np.flatnonzero(np.r_[True, s_ins[1:] != s_ins[:-1]])
        ids = s_ins[starts]
        xyz = np.stack([x, y, z], axis=1)[order]
        mins[ids] = np.minimum(mins[ids], np.minimum.reduceat(xyz, starts, axis=0))
        maxs[ids] = np.maximum(maxs[ids], np.maximum.reduceat(xyz, starts, axis=0))

        # class per instance, and check that each instance has only one class
        s_lab = lab[order]
        lab_min = np.minimum.reduceat(s_lab, starts)
        lab_max = np.maximum.reduceat(s_lab, starts)
        for i, lo, hi in zip(ids.tolist(), lab_min.tolist(), lab_max.tolist(), strict=True):
            if lo != hi or (class_of[i] != -1 and class_of[i] != lo):
                conflicts.add(i)
            if class_of[i] == -1:
                class_of[i] = lo

        done = min(start + chunk, n)
        print(f"  {done / n:6.1%}  {time.time() - t0:5.0f} s", end="\r")
    print()
    return Accumulated(n, count, sums, mins, maxs, class_of, conflicts)


# ---------------------------------------------------------------- build records


def shape_from_moments(n: int, s: dict[str, float]) -> tuple[FloatArray, FloatArray, float, float]:
    """Mean, principal axis and rough length/diameter from summed moments."""
    mean = np.array([s["x"], s["y"], s["z"]]) / n
    exx = (
        np.array(
            [
                [s["xx"], s["xy"], s["xz"]],
                [s["xy"], s["yy"], s["yz"]],
                [s["xz"], s["yz"], s["zz"]],
            ]
        )
        / n
    )
    cov = exx - np.outer(mean, mean)
    evals, evecs = np.linalg.eigh(cov)  # ascending order
    evals = np.clip(evals, 0, None)
    l3, l2, l1 = evals
    axis = evecs[:, 2]
    # Rough estimates, good for straight and roughly uniform objects only:
    #   points spread evenly along a line of length L have variance L^2 / 12
    #   points on a full cylinder surface of radius r have l2 + l3 = r^2
    length = float(np.sqrt(12 * l1))
    diameter = float(2 * np.sqrt(l2 + l3))
    return mean, axis, length, diameter


def build_records(
    acc: Accumulated,
    classes: dict[int, str],
    tags_by_instance: dict[int, list[PnidRow]],
    scan_id: str,
) -> list[Record]:
    records = []
    for i in np.flatnonzero(acc.count).tolist():
        k = int(acc.count[i])
        s = {key: float(acc.sums[key][i]) for key in SUM_KEYS}
        mean, axis, length, diameter = shape_from_moments(k, s)
        cid = int(acc.class_of[i])
        tags = tags_by_instance.get(i, [])
        primary = tags[0] if tags else None  # first P&ID row in file order
        records.append(
            {
                "scan_id": scan_id,
                "instance_id": i,
                "class_id": cid,
                "class_name": classes.get(cid, f"unknown_{cid}"),
                "is_background": cid in BACKGROUND_CLASSES,
                "point_count": k,
                "centroid": [r4(c) for c in mean],
                "bbox_min": [r4(c) for c in acc.mins[i]],
                "bbox_max": [r4(c) for c in acc.maxs[i]],
                "bbox_size": [r4(c) for c in acc.maxs[i] - acc.mins[i]],
                "principal_axis": [r4(c) for c in axis],
                "length_est_m": r4(length),
                "diameter_est_m": r4(diameter),
                "mean_color": [round(s[c] / k) for c in ("r", "g", "b")],
                "has_tag": primary is not None,
                "tag": primary.tag if primary else None,
                "element": primary.element if primary else None,
                "nominal_inch": primary.nominal_inch if primary else None,
                "system": primary.system if primary else None,
                "location": primary.location if primary else None,
                "location_source": "pnid" if primary and primary.location else None,
                "all_tags": [t.tag for t in tags],
                "class_conflict": i in acc.conflicts,
            }
        )
    return records


def assign_zones(records: list[Record]) -> None:
    """Fill location for records without a P&ID zone, in place.

    location_source after this step:
      pnid                zone comes from the object's own P&ID row
      tagged_nearest_tag  object has a tag, but its P&ID row has no zone,
                          so the zone was borrowed from the nearest object
      nearest_tag         object has no tag, zone borrowed from the nearest object
      background          Structural / Floor, no zone
    Nearest = smallest plan-view (x, y) distance between centroids.
    """
    zoned = [r for r in records if r["location_source"] == "pnid"]
    zoned_xy = np.array([r["centroid"][:2] for r in zoned])
    for r in records:
        if r["is_background"]:
            r["location_source"] = "background"
            continue
        if r["location"] or not zoned:
            continue
        d = np.linalg.norm(zoned_xy - np.array(r["centroid"][:2]), axis=1)
        nearest = zoned[int(d.argmin())]
        r["location"] = nearest["location"]
        r["location_source"] = "tagged_nearest_tag" if r["has_tag"] else "nearest_tag"
        r["nearest_tag"] = nearest["tag"]
        r["nearest_tag_distance_m"] = r4(d.min())


def build_summary(
    acc: Accumulated,
    records: list[Record],
    pnid_rows: list[PnidRow],
    source_ply: Path,
    scan_id: str,
) -> dict[str, Any]:
    ids_in_scan = {r["instance_id"] for r in records}
    dangling = sorted(
        {(row.tag, i) for row in pnid_rows for i in row.instance_ids if i not in ids_in_scan}
    )
    summary: dict[str, Any] = {
        "scan_id": scan_id,
        "source_ply": str(source_ply),
        "total_points": acc.total_points,
        "instance_count": len(records),
        "per_class": {},
        "per_location": {},
        "tags_without_instance": [row.tag for row in pnid_rows if not row.instance_ids],
        "tags_pointing_to_unknown_instance": [f"{t} -> {i}" for t, i in dangling],
        "class_conflicts": sorted(acc.conflicts),
        "notes": [
            "length_est_m and diameter_est_m are PCA-based estimates; "
            "wrong for bent or branching pipes.",
            "location for objects without a P&ID zone is taken from the nearest object "
            "that has one (location_source = nearest_tag or tagged_nearest_tag).",
            "Dataset: NORA, SENAI ISI-SIM, CC BY 4.0, doi:10.5281/zenodo.21775624",
        ],
    }
    for r in records:
        summary["per_class"][r["class_name"]] = summary["per_class"].get(r["class_name"], 0) + 1
        loc = r["location"] or "background"
        summary["per_location"][loc] = summary["per_location"].get(loc, 0) + 1
    return summary


def build(
    ply: Path, meta: Path, scan_id: str = DEFAULT_SCAN_ID, chunk: int = CHUNK
) -> tuple[list[Record], list[PnidRow], dict[str, Any]]:
    classes = load_classes(meta / "classes.json")
    pnid_rows = load_pnid(meta / "pnid_composition.csv")

    acc = accumulate(ply, chunk)
    records = build_records(acc, classes, group_by_instance(pnid_rows), scan_id)
    assign_zones(records)
    missing_tags = [row for row in pnid_rows if not row.instance_ids]
    summary = build_summary(acc, records, pnid_rows, ply, scan_id)
    return records, missing_tags, summary


# ---------------------------------------------------------------- output


def write_outputs(
    out_dir: Path, records: list[Record], missing_tags: list[PnidRow], summary: dict[str, Any]
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    with open(out_dir / "instances.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "summary": summary,
                "instances": records,
                "pnid_tags_missing_in_scan": [asdict(t) for t in missing_tags],
            },
            f,
            indent=2,
        )

    cols = [
        "scan_id", "instance_id", "class_id", "class_name", "is_background", "point_count",
        "has_tag", "tag", "element", "nominal_inch", "system", "location", "location_source",
        "length_est_m", "diameter_est_m",
        "cx", "cy", "cz", "size_x", "size_y", "size_z", "all_tags", "class_conflict",
    ]  # fmt: skip
    with open(out_dir / "instances.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in records:
            w.writerow(
                [
                    r["scan_id"],
                    r["instance_id"],
                    r["class_id"],
                    r["class_name"],
                    r["is_background"],
                    r["point_count"],
                    r["has_tag"],
                    r["tag"],
                    r["element"],
                    r["nominal_inch"],
                    r["system"],
                    r["location"],
                    r["location_source"],
                    r["length_est_m"],
                    r["diameter_est_m"],
                    *r["centroid"],
                    *r["bbox_size"],
                    ";".join(r["all_tags"]),
                    r["class_conflict"],
                ]  # fmt: skip
            )


def print_summary(summary: dict[str, Any]) -> None:
    print("\nObjects per class:")
    for name, c in sorted(summary["per_class"].items(), key=lambda kv: -kv[1]):
        print(f"  {name:<26} {c:>4}")
    print("\nObjects per location:")
    for name, c in sorted(summary["per_location"].items()):
        print(f"  {name:<26} {c:>4}")
    print(f"\nP&ID tags with no object in the scan: {summary['tags_without_instance']}")
    if summary["tags_pointing_to_unknown_instance"]:
        print(
            "P&ID tags pointing to ids not in the scan: "
            f"{summary['tags_pointing_to_unknown_instance']}"
        )
    if summary["class_conflicts"]:
        print(f"Instances with more than one class: {summary['class_conflicts']}")


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--ply", type=Path, default=Path("pointcloud/nora.ply"))
    p.add_argument("--meta", type=Path, default=Path("meta"))
    p.add_argument("--out", type=Path, default=Path("data"))
    p.add_argument("--scan-id", default=DEFAULT_SCAN_ID)
    args = p.parse_args()

    for path in (args.ply, args.meta / "classes.json", args.meta / "pnid_composition.csv"):
        if not path.exists():
            sys.exit(f"File not found: {path}")

    t0 = time.time()
    records, missing_tags, summary = build(args.ply, args.meta, args.scan_id)
    write_outputs(args.out, records, missing_tags, summary)
    print_summary(summary)
    print(f"\nWrote {args.out / 'instances.json'} and {args.out / 'instances.csv'}")
    print(f"Done in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
