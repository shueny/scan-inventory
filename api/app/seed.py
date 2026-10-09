"""
Seed the database from the pipeline's JSON files
------------------------------------------------
Loads data/scan.json, data/instances.json and data/issues.json for one scan. Idempotent:
if the scan is already in the database nothing is written, so review changes survive
restarts. Runs in one transaction.

Usage:
    uv run python -m app.seed                 # uses DATA_DIR and DATABASE_URL
    uv run python -m app.seed --data-dir ../data
"""

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.db import SessionLocal

log = logging.getLogger("scan_inventory.seed")


def _read(path: Path) -> Any:
    if not path.exists():
        sys.exit(f"File not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _vec(values: list[float]) -> list[float]:
    """JSON may hold 37 or 37.0; a Postgres float[] needs all floats."""
    return [float(v) for v in values]


def seed(session: Session, data_dir: Path) -> bool:
    """Returns True if the scan was inserted, False if it was already there."""
    meta = _read(data_dir / "scan.json")
    instances = _read(data_dir / "instances.json")["instances"]
    issues = _read(data_dir / "issues.json")["issues"]
    scan_id = meta["scan_id"]

    with session.begin():
        if session.get(models.Scan, scan_id) is not None:
            log.info("scan %s already seeded, nothing to do", scan_id)
            return False
        session.add(
            models.Scan(
                id=scan_id,
                name=meta["name"],
                source=meta["source"],
                licence=meta["licence"],
                doi=meta["doi"],
                point_count=meta["point_count"],
                zones=meta["zones"],
            )
        )
        session.add_all(
            models.ScanClass(
                scan_id=scan_id,
                class_id=c["id"],
                name=c["name"],
                color=c["color"],
                is_background=c["is_background"],
            )
            for c in meta["classes"]
        )
        session.flush()  # classes must exist before instances reference them
        session.add_all(
            models.Instance(
                scan_id=scan_id,
                instance_id=r["instance_id"],
                class_id=r["class_id"],
                is_background=r["is_background"],
                point_count=r["point_count"],
                centroid=_vec(r["centroid"]),
                bbox_min=_vec(r["bbox_min"]),
                bbox_max=_vec(r["bbox_max"]),
                length_est_m=r["length_est_m"],
                diameter_est_m=r["diameter_est_m"],
                has_tag=r["has_tag"],
                tag=r["tag"],
                all_tags=r["all_tags"],
                element=r["element"],
                nominal_inch=r["nominal_inch"],
                system=r["system"],
                location=r["location"],
                location_source=r["location_source"],
                review_status="unreviewed",
                current_class_id=r["class_id"],
            )
            for r in instances
        )
        session.add_all(
            models.Issue(
                scan_id=scan_id,
                issue_id=x["issue_id"],
                type=x["type"],
                severity=x["severity"],
                instance_ids=x["instance_ids"],
                tags=x["tags"],
                title=x["title"],
                detail=x["detail"],
                suggested_action=x["suggested_action"],
                suggested_class_id=x["suggested_class_id"],
                candidate_tags=x["candidate_tags"],
                status="open",
                sort_order=order,
            )
            for order, x in enumerate(issues)
        )
    log.info("seeded scan %s: %d instances, %d issues", scan_id, len(instances), len(issues))
    return True


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--data-dir", type=Path, default=settings.data_dir)
    args = p.parse_args()
    with SessionLocal() as session:
        seed(session, args.data_dir)


if __name__ == "__main__":
    main()
