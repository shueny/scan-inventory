"""
Build the browser test fixtures (web/e2e/fixtures/data/)
--------------------------------------------------------
The real scan is gitignored, so the Playwright smoke test (and CI) runs on a tiny
synthetic plant instead: the API's test objects (api/tests/fixtures/, 6 objects and
5 issues), renamed to scan "nora" so the app loads them unchanged, with real class
colours and a few thousand generated points inside each object's box, converted to
Potree tiles with PotreeConverter.

The output is small (well under 1 MB) and committed. Rebuild only when the fixtures
change; needs PotreeConverter (scripts/potree/build_converter.sh).

Usage (from the repo root):
    uv run --project scripts python scripts/build_e2e_fixtures.py
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import laspy
import numpy as np

from class_palette import CLASS_COLORS, UNKNOWN_COLOR

REPO = Path(__file__).resolve().parents[1]
SOURCE = REPO / "api" / "tests" / "fixtures"
OUT = REPO / "web" / "e2e" / "fixtures" / "data"
CONVERTER = Path(
    os.environ.get(
        "POTREE_CONVERTER", REPO / ".tools" / "PotreeConverter" / "build" / "PotreeConverter"
    )
)
SCAN_ID = "nora"
SEED = 20261009


def renamed(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{**row, "scan_id": SCAN_ID} for row in rows]


def json_text(data: Any) -> str:
    return json.dumps(data, indent=1) + "\n"


def hex_rgb(color: str) -> tuple[int, int, int]:
    return int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)


def write_las(instances: list[dict[str, Any]], path: Path) -> int:
    """Points spread through each object's box, as many as its point_count, with
    classification = class id and point_source_id = instance id, like
    scripts/export_las.py writes the real scan."""
    rng = np.random.default_rng(SEED)
    blocks = []
    for inst in instances:
        lo, hi = np.array(inst["bbox_min"]), np.array(inst["bbox_max"])
        xyz = lo + rng.random((inst["point_count"], 3)) * (hi - lo)
        blocks.append((xyz, inst["class_id"], inst["instance_id"]))

    xyz_all = np.concatenate([b[0] for b in blocks])
    header = laspy.LasHeader(point_format=7, version="1.4")
    header.scales = np.array([0.0001] * 3)
    header.offsets = xyz_all.min(axis=0)
    las = laspy.LasData(header)
    las.x, las.y, las.z = xyz_all[:, 0], xyz_all[:, 1], xyz_all[:, 2]
    classes = np.concatenate([np.full(len(b[0]), b[1], np.uint8) for b in blocks])
    ids = np.concatenate([np.full(len(b[0]), b[2], np.uint16) for b in blocks])
    las.classification = classes
    las.point_source_id = ids
    rgb = np.array([hex_rgb(CLASS_COLORS.get(int(c), UNKNOWN_COLOR)) for c in classes])
    las.red, las.green, las.blue = (rgb[:, k].astype(np.uint16) * 257 for k in range(3))
    las.write(path)
    return len(xyz_all)


def derive_json(source: Path = SOURCE) -> dict[str, Any]:
    """The three JSON files of the fixture plant, derived from the API's test fixtures.
    Pure, so a test can check that the committed files are not stale."""
    scan = json.loads((source / "scan.json").read_text())
    instances = json.loads((source / "instances.json").read_text())
    issues = json.loads((source / "issues.json").read_text())
    instances["instances"] = renamed(instances["instances"])
    scan.update(
        scan_id=SCAN_ID,
        name="E2E fixture plant",
        source="synthetic test data",
        point_count=sum(i["point_count"] for i in instances["instances"]),
    )
    for c in scan["classes"]:
        c["color"] = CLASS_COLORS.get(c["id"], UNKNOWN_COLOR)
    issues["scan_id"] = SCAN_ID
    return {"scan.json": scan, "instances.json": instances, "issues.json": issues}


def main() -> None:
    if not CONVERTER.exists():
        sys.exit(f"PotreeConverter not found at {CONVERTER}; see scripts/potree/build_converter.sh")
    files = derive_json()

    # Build everything in a temporary folder and swap it in only when it all worked,
    # so a failed conversion leaves the committed fixtures untouched.
    with tempfile.TemporaryDirectory() as tmp:
        staging = Path(tmp) / "data"
        tiles = staging / "potree" / SCAN_ID
        tiles.mkdir(parents=True)
        las_path = Path(tmp) / "fixture.las"
        write_las(files["instances.json"]["instances"], las_path)
        subprocess.run(
            [str(CONVERTER), str(las_path), "-o", str(tiles), "--attributes", "rgb",
             "classification", "point source id"],
            check=True,
            stdout=subprocess.DEVNULL,
        )  # fmt: skip
        (tiles / "log.txt").unlink(missing_ok=True)
        # PotreeConverter leaves trailing spaces in metadata.json; pre-commit rejects them.
        meta = tiles / "metadata.json"
        meta.write_text("\n".join(line.rstrip() for line in meta.read_text().splitlines()) + "\n")
        for name, data in files.items():
            (staging / name).write_text(json_text(data), encoding="utf-8")

        shutil.rmtree(OUT, ignore_errors=True)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(staging, OUT)

    size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    points = files["scan.json"]["point_count"]
    print(f"Wrote {OUT.relative_to(REPO)}: {points:,} points, {size:,} bytes")


if __name__ == "__main__":
    main()
