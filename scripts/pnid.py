"""Read the P&ID tag list (meta/pnid_composition.csv).

Shared by build_instances.py and build_issues.py so both read the CSV the same way.
"""

import csv
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path


@dataclass(frozen=True)
class PnidRow:
    tag: str
    element: str
    dimension: str | None
    nominal_inch: float | None
    spool_colour: str | None
    location: str | None
    system: str | None
    instance_ids: tuple[int, ...]  # empty when the tag was not found in the scan


def parse_inches(text: str | None) -> float | None:
    """'2 1/2"' -> 2.5, '1/2"' -> 0.5, '' -> None"""
    text = (text or "").replace('"', "").strip()
    if not text:
        return None
    return float(sum(Fraction(part) for part in text.split()))


def parse_instance_ids(text: str) -> tuple[int, ...]:
    """'177,175' -> (177, 175), '' -> ()"""
    return tuple(int(x) for x in text.replace(" ", "").split(",") if x)


def load_pnid(path: Path) -> list[PnidRow]:
    """All rows in file order, every cell trimmed (some cells have trailing spaces)."""
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for raw in csv.DictReader(f):
            row = {k.strip(): (v or "").strip() for k, v in raw.items()}
            rows.append(
                PnidRow(
                    tag=row["TAG"],
                    element=row["Element"],
                    dimension=row["Dimension"] or None,
                    nominal_inch=parse_inches(row["Dimension"]),
                    spool_colour=row["Spool colour"] or None,
                    location=row["Location"] or None,
                    system=row["System"] or None,
                    instance_ids=parse_instance_ids(row["Instance ID"]),
                )
            )
    return rows
