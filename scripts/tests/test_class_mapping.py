from class_mapping import ALLOWED_CLASSES, allowed_classes, suggest_class


def test_every_mapped_element_allows_at_least_one_class() -> None:
    assert all(ALLOWED_CLASSES.values())


def test_unmapped_element_returns_none() -> None:
    assert allowed_classes("flux capacitor") is None
    assert suggest_class("flux capacitor", 2.0) is None


def test_single_allowed_class_is_the_suggestion() -> None:
    assert suggest_class("safety valve", 1.0) == 12


def test_ball_valve_suggestion_depends_on_size() -> None:
    assert suggest_class("ball valve", 0.5) == 22  # small manual valve
    assert suggest_class("ball valve", 2.0) == 2  # manual lever valve
    assert suggest_class("ball valve", None) is None


def test_pump_has_no_single_suggestion() -> None:
    assert allowed_classes("water pump") == frozenset({13, 20})
    assert suggest_class("water pump", 3.0) is None
