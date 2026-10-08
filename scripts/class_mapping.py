"""Which annotated classes fit each P&ID element type.

Used by the class_mismatch rule in build_issues.py. Reviewed by the owner (T1).
Each entry was checked against the real data: every P&ID row whose instance has a
class outside its set is a real annotation problem, not a gap in this table.

Class ids (meta/classes.json):
  1 Manual wheel valve, 2 Manual lever valve, 3 Pressure meter, 4 Transmitter,
  9 Control valve, 10 Automated on/off valve, 11 Check valve, 12 Pressure safety valve,
  13 Motor, 14 Strainer/Filter, 17 Tank/Vessel, 20 Piping components, 22 Small manual valve
"""

ALLOWED_CLASSES: dict[str, frozenset[int]] = {
    # valves
    "automated on/off valve - type ball": frozenset({10}),
    "ball valve": frozenset({2, 22}),  # lever handle, or small manual valve below 1"
    "butterfly valve": frozenset({2}),
    "gate valve": frozenset({1}),
    "globe valve": frozenset({1}),
    "check valve": frozenset({11}),
    "control valve": frozenset({9}),
    "pressure reducing regulators": frozenset({9}),
    "safety valve": frozenset({12}),
    # instruments
    "indicator": frozenset({3}),
    "transmitter": frozenset({4}),
    # strainers
    "strainer": frozenset({14}),
    "strainer Y": frozenset({14}),
    "double strainer": frozenset({14}),
    # vessels
    "pressure vessel": frozenset({17}),
    "separator": frozenset({17}),
    # piping
    "expansion joints": frozenset({20}),
    # The dataset has no pump class: the casing is annotated as Piping components (20)
    # and the drive as Motor (13). One pump tag can cover both (see tag_split).
    "centrifugal pump": frozenset({13, 20}),
    "water pump": frozenset({13, 20}),
}

# In the data every ball valve up to 3/4" is a Small manual valve (22) and every one
# from 1 1/2" up is a Manual lever valve (2).
SMALL_VALVE_MAX_INCH = 1.0
SMALL_MANUAL_VALVE = 22
MANUAL_LEVER_VALVE = 2


def allowed_classes(element: str) -> frozenset[int] | None:
    """Allowed class ids for an element type, or None when the type is not mapped."""
    return ALLOWED_CLASSES.get(element)


def suggest_class(element: str, nominal_inch: float | None) -> int | None:
    """The class a mismatched object should most likely have, or None if unclear."""
    allowed = allowed_classes(element)
    if not allowed:
        return None
    if len(allowed) == 1:
        return next(iter(allowed))
    if allowed == {MANUAL_LEVER_VALVE, SMALL_MANUAL_VALVE} and nominal_inch is not None:
        return SMALL_MANUAL_VALVE if nominal_inch < SMALL_VALVE_MAX_INCH else MANUAL_LEVER_VALVE
    return None
