"""
T13 spike: how well can objects of two detection runs be matched?
-----------------------------------------------------------------
Run 1 is data/instances.json. Run 2 is built three ways, and every result says which:

  run1       run 1's own boxes (only the scripted changes differ)
  random13   boxes measured again from nora-random13.las, then the scripted changes
  voxel5mm   boxes measured again from nora-voxel5mm.las, then the scripted changes

For each source, 20 seeds of scripted changes (perturb_run.py) are matched
(match_runs.py) at several thresholds and scored per change type. Structural and
Floor are left out: their boxes hold most of the plant.

Usage (from the repo root; the LAS pass takes a few minutes the first time):
    uv run --project scripts python scripts/t13_match_spike.py
Outputs:
    data/spikes/t13/run2-<source>.json   geometry measured again (cache)
    data/spikes/t13/results.json         all scores and every missed case
"""

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np

from build_instances import BACKGROUND_CLASSES
from match_runs import Box, Match, iou, match_runs
from perturb_run import perturb
from remeasure_run import remeasure

SEEDS = range(20)
IOU_GRID = (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)
CONTAIN_GRID = (0.6, 0.7, 0.8, 0.9, 0.95)
DEFAULT_IOU, DEFAULT_CONTAIN = 0.5, 0.8
CATEGORIES = ("unchanged", "class changed", "removed", "added", "split", "merge")


def category(m: Match) -> str:
    if m.kind == "same":
        return "class changed" if m.class_changed else "unchanged"
    return m.kind


def score(
    truth: list[Match], predicted: list[Match]
) -> tuple[Counter[str], Counter[str], list[Match]]:
    """(correct per category, total per category, true matches the matcher got wrong)."""
    found = set(predicted)
    correct: Counter[str] = Counter()
    total: Counter[str] = Counter()
    missed = []
    for t in truth:
        total[category(t)] += 1
        if t in found:
            correct[category(t)] += 1
        else:
            missed.append(t)
    return correct, total, missed


def boxes_from(records: list[dict[str, Any]]) -> list[Box]:
    return [
        Box(r["instance_id"], r["class_id"], tuple(r["bbox_min"]), tuple(r["bbox_max"]))
        for r in records
        if r["class_id"] not in BACKGROUND_CLASSES
    ]


def evaluate(old: list[Box], base: list[Box], iou_min: float, contain_min: float) -> dict[str, Any]:
    """Score 20 seeds of scripted changes on `base`, matched against `old`."""
    lost = sorted({b.id for b in old} - {b.id for b in base})
    correct: Counter[str] = Counter()
    total: Counter[str] = Counter()
    wrong_events: Counter[str] = Counter()
    missed_cases = []
    for seed in SEEDS:
        new, truth = perturb(base, seed)
        truth += [Match("removed", (i,), ()) for i in lost]  # lost by sampling
        predicted = match_runs(old, new, iou_min, contain_min)
        c, t, missed = score(truth, predicted)
        correct += c
        total += t
        wrong_events += Counter(m.kind for m in set(predicted) - set(truth))
        by_old = {i: m for m in predicted for i in m.old_ids}
        by_new = {i: m for m in predicted for i in m.new_ids}
        for m in missed:
            got = {by_old[i] for i in m.old_ids} | {by_new[i] for i in m.new_ids}
            missed_cases.append(
                {"seed": seed, "true": _show(m), "matcher": sorted(_show(g) for g in got)}
            )
    return {
        "iou_min": iou_min,
        "contain_min": contain_min,
        "correct": dict(correct),
        "total": dict(total),
        "wrong_events": dict(wrong_events),
        "missed": missed_cases,
    }


def _show(m: Match) -> str:
    flag = " (class changed)" if m.class_changed else ""
    return f"{m.kind} {list(m.old_ids)} -> {list(m.new_ids)}{flag}"


def remeasure_drift(old: list[Box], base: list[Box]) -> dict[str, Any]:
    """How far the sampled geometry moved from run 1, before any scripted change."""
    by_id = {b.id: b for b in base}
    ious = np.array([iou(b, by_id[b.id]) for b in old if b.id in by_id])
    return {
        "objects": len(ious),
        "lost": sorted({b.id for b in old} - set(by_id)),
        "iou_min": round(float(ious.min()), 3),
        "iou_p5": round(float(np.percentile(ious, 5)), 3),
        "iou_median": round(float(np.median(ious)), 3),
        "below_0.5": int((ious < 0.5).sum()),
    }


def table(rows: list[dict[str, Any]], key: str) -> str:
    head = f"| {key} | " + " | ".join(CATEGORIES) + " | wrong events |"
    lines = [head, "|" + "---|" * (len(CATEGORIES) + 2)]
    for r in rows:
        cells = [f"{r['correct'].get(c, 0)}/{r['total'].get(c, 0)}" for c in CATEGORIES]
        wrong = ", ".join(f"{k} {v}" for k, v in sorted(r["wrong_events"].items())) or "none"
        lines.append(f"| {r[key]} | " + " | ".join(cells) + f" | {wrong} |")
    return "\n".join(lines)


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--instances", type=Path, default=Path("data/instances.json"))
    p.add_argument("--las-dir", type=Path, default=Path("data/las"))
    p.add_argument("--out", type=Path, default=Path("data/spikes/t13"))
    args = p.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    old = boxes_from(json.loads(args.instances.read_text())["instances"])
    sources = {"run1": old}
    for name in ("random13", "voxel5mm"):
        cache = args.out / f"run2-{name}.json"
        if not cache.exists():
            print(f"Measuring {name} again from LAS ...")
            records = remeasure(args.las_dir / f"nora-{name}.las")
            cache.write_text(json.dumps({"instances": records}, indent=2))
        sources[name] = boxes_from(json.loads(cache.read_text())["instances"])

    results: dict[str, Any] = {}
    for name, base in sources.items():
        drift = remeasure_drift(old, base)
        by_iou = [evaluate(old, base, t, DEFAULT_CONTAIN) for t in IOU_GRID]
        by_contain = [evaluate(old, base, DEFAULT_IOU, c) for c in CONTAIN_GRID]
        results[name] = {"drift": drift, "by_iou": by_iou, "by_contain": by_contain}
        print(f"\n## {name}\n\nGeometry drift from run 1: {drift}\n")
        print(f"IoU threshold sweep (containment {DEFAULT_CONTAIN}):\n")
        print(table(by_iou, "iou_min"))
        print(f"\nContainment threshold sweep (IoU {DEFAULT_IOU}):\n")
        print(table(by_contain, "contain_min"))

    (args.out / "results.json").write_text(json.dumps(results, indent=2))
    print(f"\nWrote {args.out / 'results.json'}")


if __name__ == "__main__":
    main()
