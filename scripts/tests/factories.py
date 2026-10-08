"""Small synthetic fixtures. Tests never touch the real 3.25 GB point cloud."""

from typing import Any

from pnid import PnidRow


def make_row(
    tag: str = "V-1",
    element: str = "gate valve",
    instance_ids: tuple[int, ...] = (),
    nominal_inch: float | None = 2.0,
    location: str | None = "NW",
    system: str | None = "SYS - 1",
) -> PnidRow:
    return PnidRow(
        tag=tag,
        element=element,
        dimension=None if nominal_inch is None else f'{nominal_inch}"',
        nominal_inch=nominal_inch,
        spool_colour=None,
        location=location,
        system=system,
        instance_ids=instance_ids,
    )


def make_record(instance_id: int = 1, **overrides: Any) -> dict[str, Any]:
    record: dict[str, Any] = {
        "scan_id": "test",
        "instance_id": instance_id,
        "class_id": 1,
        "class_name": "Manual wheel valve",
        "is_background": False,
        "point_count": 100,
        "centroid": [0.0, 0.0, 0.0],
        "length_est_m": 0.5,
        "diameter_est_m": 0.1,
        "has_tag": False,
        "tag": None,
        "element": None,
        "nominal_inch": None,
        "system": None,
        "location": "NW",
        "location_source": "nearest_tag",
        "all_tags": [],
    }
    record.update(overrides)
    return record
