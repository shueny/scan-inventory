"""
Build the scan metadata for scan-inventory
------------------------------------------
Writes data/scan.json: scan name and licence, the class list with display colours,
and the zone list. Read by the static demo and used to seed the API (T4).
Output schema: docs/data-schema.md

Usage (from the repo root, after build_instances.py):
    uv run --project scripts python scripts/build_scan_meta.py
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from build_instances import BACKGROUND_CLASSES, load_classes
from class_palette import color_for

# Display order of zones (PRD section 3); values not listed here go last, sorted.
ZONE_ORDER = ["NW", "NC", "NE", "SW", "SC", "SE", "SW - SE"]


def ordered_zones(zones: set[str]) -> list[str]:
    known = [z for z in ZONE_ORDER if z in zones]
    return known + sorted(zones - set(ZONE_ORDER))


def build_scan_meta(
    scan_id: str, classes: dict[int, str], instances: list[dict[str, Any]], total_points: int
) -> dict[str, Any]:
    present = {r["class_id"] for r in instances}
    return {
        "scan_id": scan_id,
        "name": "NORA industrial plant",
        "source": "NORA dataset, SENAI ISI-SIM",
        "licence": "CC BY 4.0",
        "doi": "10.5281/zenodo.21775624",
        "instance_count": len(instances),
        "point_count": total_points,
        "classes": [
            {
                "id": cid,
                "name": name,
                "color": color_for(cid),
                "is_background": cid in BACKGROUND_CLASSES,
                "instance_count": sum(1 for r in instances if r["class_id"] == cid),
            }
            for cid, name in sorted(classes.items())
            if cid in present
        ],
        "zones": ordered_zones({r["location"] for r in instances if r["location"]}),
    }


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--instances", type=Path, default=Path("data/instances.json"))
    p.add_argument("--meta", type=Path, default=Path("meta"))
    p.add_argument("--out", type=Path, default=Path("data/scan.json"))
    args = p.parse_args()

    for path in (args.instances, args.meta / "classes.json"):
        if not path.exists():
            sys.exit(f"File not found: {path}")

    data = json.loads(args.instances.read_text(encoding="utf-8"))
    summary = data["summary"]
    meta = build_scan_meta(
        summary["scan_id"],
        load_classes(args.meta / "classes.json"),
        data["instances"],
        summary["total_points"],
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}: {len(meta['classes'])} classes, zones {meta['zones']}")


if __name__ == "__main__":
    main()
