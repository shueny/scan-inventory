"""
Build the review queue for scan-inventory
-----------------------------------------
Reads data/instances.json and the P&ID tag list and applies rule-based checks.
Each rule is a small pure function. Output schema: docs/data-schema.md

Usage (from the repo root, after build_instances.py):
    uv run --project scripts python scripts/build_issues.py
    uv run --project scripts python scripts/build_issues.py \\
        --instances data/instances.json --meta meta --out data/issues.json
"""

import argparse
import json
import math
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from class_mapping import allowed_classes, suggest_class
from pnid import PnidRow, load_pnid

Record = dict[str, Any]

PIPE = 8
TRANSMITTER = 4
FLANGED_JOINT = 23
UNRELIABLE_DIAMETER_M = 0.3  # a PCA "diameter" above this means a bent or branched pipe

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}
TYPE_ORDER = [
    "class_mismatch",
    "tag_missing_in_scan",
    "untagged_equipment",
    "tag_split",
    "estimate_unreliable",
    "zone_borrowed",
]


@dataclass
class Issue:
    issue_id: str
    type: str
    severity: str
    instance_ids: list[int]
    tags: list[str]
    title: str
    detail: str
    suggested_action: str | None  # None when the rule has no concrete fix to propose
    suggested_class_id: int | None = None
    candidate_tags: list[dict[str, Any]] = field(default_factory=list)


# ---------------------------------------------------------------- rules


def class_mismatch(
    rows: list[PnidRow], instances: dict[int, Record], classes: dict[int, str]
) -> tuple[list[Issue], set[str]]:
    """P&ID element type does not fit the annotated class. Returns (issues, unmapped types)."""
    issues, unmapped = [], set()
    for row in rows:
        allowed = allowed_classes(row.element)
        if allowed is None:
            unmapped.add(row.element)
            continue
        for i in row.instance_ids:
            inst = instances.get(i)
            if inst is None or inst["class_id"] in allowed:
                continue
            allowed_names = ", ".join(classes.get(c, str(c)) for c in sorted(allowed))
            size = f" {row.dimension}" if row.dimension else ""
            issues.append(
                Issue(
                    issue_id=f"class_mismatch:{i}",
                    type="class_mismatch",
                    severity="high",
                    instance_ids=[i],
                    tags=[row.tag],
                    title=f"P&ID says {row.element}, annotation says {inst['class_name']}",
                    detail=(
                        f"Tag {row.tag} ({row.element}{size}) points to instance {i}, "
                        f"annotated as {inst['class_name']}. "
                        f"Expected class for this element: {allowed_names}."
                    ),
                    suggested_action="change_class",
                    suggested_class_id=suggest_class(row.element, row.nominal_inch),
                )
            )
    return issues, unmapped


def tag_missing_in_scan(rows: list[PnidRow]) -> list[Issue]:
    """P&ID row with no instance id."""
    return [
        Issue(
            issue_id=f"tag_missing_in_scan:{row.tag}",
            type="tag_missing_in_scan",
            severity="medium",
            instance_ids=[],
            tags=[row.tag],
            title=f"P&ID tag {row.tag} ({row.element}) has no object in the scan",
            detail=(
                f"{row.tag} ({row.element}, system {row.system or 'unknown'}, "
                f"zone {row.location or 'unknown'}) is in the P&ID but no object was linked to it."
            ),
            suggested_action=None,
        )
        for row in rows
        if not row.instance_ids
    ]


def transmitter_candidates(
    inst: Record, rows: list[PnidRow], instances: dict[int, Record]
) -> list[dict[str, Any]]:
    """Untagged P&ID transmitters, ranked by the distance from `inst` to the nearest
    object of the same system. Tags whose system has no object in the scan go last."""
    candidates = []
    for row in rows:
        if row.element != "transmitter" or row.instance_ids:
            continue
        same_system = [o for o in instances.values() if row.system and o["system"] == row.system]
        d = min((math.dist(inst["centroid"], o["centroid"]) for o in same_system), default=None)
        candidates.append(
            {"tag": row.tag, "system": row.system, "distance_m": None if d is None else round(d, 2)}
        )
    candidates.sort(key=lambda c: (c["distance_m"] is None, c["distance_m"] or 0.0, c["tag"]))
    return candidates


def untagged_equipment(rows: list[PnidRow], instances: dict[int, Record]) -> list[Issue]:
    """Non-background, non-pipe, non-flange object without a tag."""
    issues = []
    for i, inst in sorted(instances.items()):
        if inst["is_background"] or inst["has_tag"] or inst["class_id"] in (PIPE, FLANGED_JOINT):
            continue
        is_transmitter = inst["class_id"] == TRANSMITTER
        issues.append(
            Issue(
                issue_id=f"untagged_equipment:{i}",
                type="untagged_equipment",
                severity="medium",
                instance_ids=[i],
                tags=[],
                title=f"{inst['class_name']} {i} has no P&ID tag",
                detail=(
                    f"Instance {i} ({inst['class_name']}, zone {inst['location']}) "
                    "is equipment but no P&ID row points to it."
                ),
                suggested_action="assign_tag",
                candidate_tags=transmitter_candidates(inst, rows, instances)
                if is_transmitter
                else [],
            )
        )
    return issues


def tag_split(rows: list[PnidRow], instances: dict[int, Record]) -> list[Issue]:
    """One tag maps to more than one instance."""
    issues = []
    for row in rows:
        if len(row.instance_ids) < 2:
            continue
        parts = ", ".join(
            f"{i} ({instances[i]['class_name']})" if i in instances else f"{i} (not in scan)"
            for i in row.instance_ids
        )
        issues.append(
            Issue(
                issue_id=f"tag_split:{row.tag}",
                type="tag_split",
                severity="low",
                instance_ids=sorted(row.instance_ids),
                tags=[row.tag],
                title=f"Tag {row.tag} maps to {len(row.instance_ids)} objects",
                detail=f"{row.tag} ({row.element}) points to instances {parts}.",
                suggested_action=None,
            )
        )
    return issues


def estimate_unreliable(instances: dict[int, Record]) -> list[Issue]:
    """Pipe whose PCA diameter is too large for a straight pipe."""
    return [
        Issue(
            issue_id=f"estimate_unreliable:{i}",
            type="estimate_unreliable",
            severity="low",
            instance_ids=[i],
            tags=[],
            title=f"Pipe {i}: length estimate is not reliable",
            detail=(
                f"Estimated diameter {inst['diameter_est_m']} m is above "
                f"{UNRELIABLE_DIAMETER_M} m, so the pipe is probably bent or branched and "
                f"the PCA length ({inst['length_est_m']} m) is not trustworthy."
            ),
            suggested_action=None,
        )
        for i, inst in sorted(instances.items())
        if inst["class_id"] == PIPE and (inst["diameter_est_m"] or 0) > UNRELIABLE_DIAMETER_M
    ]


def zone_borrowed(instances: dict[int, Record]) -> list[Issue]:
    """Tagged object whose zone came from the nearest tag."""
    return [
        Issue(
            issue_id=f"zone_borrowed:{i}",
            type="zone_borrowed",
            severity="low",
            instance_ids=[i],
            tags=[inst["tag"]],
            title=f"{inst['tag']}: zone {inst['location']} was borrowed from a nearby tag",
            detail=(
                f"The P&ID row for {inst['tag']} has no zone. Zone {inst['location']} "
                f"was taken from the nearest object ({inst.get('nearest_tag')}, "
                f"{inst.get('nearest_tag_distance_m')} m away)."
            ),
            suggested_action=None,
        )
        for i, inst in sorted(instances.items())
        if inst["location_source"] == "tagged_nearest_tag"
    ]


# ---------------------------------------------------------------- pipeline


def sort_key(issue: Issue) -> tuple[int, int, int, str]:
    first_id = issue.instance_ids[0] if issue.instance_ids else -1
    return (SEVERITY_ORDER[issue.severity], TYPE_ORDER.index(issue.type), first_id, issue.issue_id)


def build_issues(
    records: list[Record], rows: list[PnidRow], classes: dict[int, str]
) -> tuple[list[Issue], set[str]]:
    instances = {r["instance_id"]: r for r in records}
    mismatches, unmapped = class_mismatch(rows, instances, classes)
    issues = [
        *mismatches,
        *tag_missing_in_scan(rows),
        *untagged_equipment(rows, instances),
        *tag_split(rows, instances),
        *estimate_unreliable(instances),
        *zone_borrowed(instances),
    ]
    return sorted(issues, key=sort_key), unmapped


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--instances", type=Path, default=Path("data/instances.json"))
    p.add_argument("--meta", type=Path, default=Path("meta"))
    p.add_argument("--out", type=Path, default=Path("data/issues.json"))
    args = p.parse_args()

    for path in (args.instances, args.meta / "classes.json", args.meta / "pnid_composition.csv"):
        if not path.exists():
            sys.exit(f"File not found: {path}")

    with open(args.instances, encoding="utf-8") as f:
        data = json.load(f)
    with open(args.meta / "classes.json", encoding="utf-8") as f:
        classes = {int(k): v for k, v in json.load(f).items()}
    rows = load_pnid(args.meta / "pnid_composition.csv")

    issues, unmapped = build_issues(data["instances"], rows, classes)
    for element in sorted(unmapped):
        print(f"WARNING: P&ID element type not in class_mapping, skipped: {element!r}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(
            {
                "scan_id": data["summary"]["scan_id"],
                "issue_count": len(issues),
                "issues": [asdict(i) for i in issues],
            },
            f,
            indent=2,
        )

    print(f"\n{len(issues)} issues:")
    for t in TYPE_ORDER:
        n = sum(1 for i in issues if i.type == t)
        print(f"  {t:<22} {n:>3}")
    print(f"\nWrote {args.out}")


if __name__ == "__main__":
    main()
