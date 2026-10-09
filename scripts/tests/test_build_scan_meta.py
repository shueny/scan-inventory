import re

from build_scan_meta import build_scan_meta, ordered_zones
from class_palette import CLASS_COLORS, UNKNOWN_COLOR, color_for
from tests.factories import make_record

CLASSES = {0: "Structural", 1: "Manual wheel valve", 7: "Floor", 8: "Pipe", 99: "Unused"}


def test_every_palette_colour_is_a_hex_colour_and_unique() -> None:
    colors = list(CLASS_COLORS.values())
    assert all(re.fullmatch(r"#[0-9a-f]{6}", c) for c in colors)
    assert len(set(colors)) == len(colors)


def test_unknown_class_gets_fallback_colour() -> None:
    assert color_for(12345) == UNKNOWN_COLOR


def test_zones_follow_display_order_and_keep_unknown_values() -> None:
    assert ordered_zones({"SE", "NW", "SW - SE", "XX"}) == ["NW", "SE", "SW - SE", "XX"]


def test_scan_meta_lists_only_classes_present_with_colour_and_counts() -> None:
    instances = [
        make_record(1, class_id=1, location="NE"),
        make_record(2, class_id=1, location="NW"),
        make_record(3, class_id=0, is_background=True, location=None),
        make_record(4, class_id=8, location="NE"),
    ]

    meta = build_scan_meta("nora", CLASSES, instances, total_points=1000)

    assert meta["scan_id"] == "nora"
    assert meta["point_count"] == 1000
    assert meta["instance_count"] == 4
    assert [c["id"] for c in meta["classes"]] == [0, 1, 8]  # 7 and 99 have no instances
    valve = meta["classes"][1]
    assert valve == {
        "id": 1,
        "name": "Manual wheel valve",
        "color": CLASS_COLORS[1],
        "is_background": False,
        "instance_count": 2,
    }
    assert meta["classes"][0]["is_background"] is True
    assert meta["zones"] == ["NW", "NE"]
    assert meta["licence"] == "CC BY 4.0"
