"""Display colour per class id. The single source of truth for class colours.

build_scan_meta.py writes these into data/scan.json; the viewer, the lists and the
API (T4) all read them from there, so 3D and panels always show the same colour.

Families share a hue range so the scene reads at a glance:
  background  light greys (shown muted by default, ADR 0007)
  piping      blues and teal-grey
  valves      reds, oranges, ambers, magentas
  instruments teal and cyan
  equipment   purples, green, slate
Colour is never the only signal: every list shows the class name next to the swatch.
"""

CLASS_COLORS: dict[int, str] = {
    # background
    0: "#c9ccd1",  # Structural
    7: "#e3e5e8",  # Floor
    # piping
    8: "#3b6ea8",  # Pipe
    23: "#86acd9",  # Pipeline flanged joint
    20: "#5b8f8a",  # Piping components
    # valves
    1: "#d1495b",  # Manual wheel valve
    2: "#e8833a",  # Manual lever valve
    22: "#f2b134",  # Small manual valve
    9: "#b5367c",  # Control valve
    10: "#8e44ad",  # Automated on/off valve
    11: "#9c2a2a",  # Check valve
    12: "#ff2d6f",  # Pressure safety valve
    # instruments
    3: "#2a9d8f",  # Pressure meter
    4: "#00a6d6",  # Transmitter
    # equipment
    13: "#5e4b8b",  # Motor
    14: "#6a9f58",  # Strainer/Filter
    17: "#4d5d6c",  # Tank/Vessel
}

UNKNOWN_COLOR = "#7f7f7f"


def color_for(class_id: int) -> str:
    return CLASS_COLORS.get(class_id, UNKNOWN_COLOR)
