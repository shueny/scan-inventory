import json

from build_e2e_fixtures import OUT, derive_json


def test_committed_e2e_fixtures_match_the_api_fixtures() -> None:
    """The browser smoke test runs on web/e2e/fixtures/data. If this fails, the API's
    test fixtures changed: run `make e2e-fixtures` and commit the result."""
    for name, data in derive_json().items():
        assert json.loads((OUT / name).read_text()) == data, name


def test_fixture_point_count_is_the_sum_of_the_objects() -> None:
    files = derive_json()
    objects = files["instances.json"]["instances"]
    assert files["scan.json"]["point_count"] == sum(i["point_count"] for i in objects)
    assert {i["scan_id"] for i in objects} == {"nora"}


def test_committed_tiles_hold_the_objects_points() -> None:
    """The tiles were built from the same objects: same total and same points per class."""
    files = derive_json()
    meta = json.loads((OUT / "potree" / "nora" / "metadata.json").read_text())
    assert meta["points"] == files["scan.json"]["point_count"]

    per_class: dict[int, int] = {}
    for i in files["instances.json"]["instances"]:
        per_class[i["class_id"]] = per_class.get(i["class_id"], 0) + i["point_count"]
    classification = next(a for a in meta["attributes"] if a["name"] == "classification")
    histogram = classification["histogram"]
    assert {c: histogram[c] for c in per_class} == per_class
    assert sum(histogram) == meta["points"]
