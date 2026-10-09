from typing import Any

import pytest
from fastapi.testclient import TestClient

BASE = "/api/scans/test"


def events(client: TestClient, instance_id: int) -> list[dict[str, Any]]:
    history: list[dict[str, Any]] = client.get(f"{BASE}/instances/{instance_id}").json()["history"]
    return history


# ---------------------------------------------------------------- health, scan


def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}


def test_scan_meta_has_classes_with_counts_zones_and_licence(client: TestClient) -> None:
    meta = client.get(BASE).json()

    assert meta["scan_id"] == "test"
    assert meta["instance_count"] == 6
    assert meta["zones"] == ["NW", "NE", "SW - SE"]
    assert meta["licence"] == "CC BY 4.0"
    pipe = next(c for c in meta["classes"] if c["id"] == 8)
    assert pipe["instance_count"] == 1
    assert pipe["color"].startswith("#")
    assert next(c for c in meta["classes"] if c["id"] == 0)["is_background"] is True


def test_unknown_scan_is_404(client: TestClient) -> None:
    for path in ("/api/scans/nope", "/api/scans/nope/instances", "/api/scans/nope/issues"):
        response = client.get(path)
        assert response.status_code == 404
        assert "scan nope" in response.json()["detail"]


# ---------------------------------------------------------------- instances


def ids(response: Any) -> list[int]:
    return [i["instance_id"] for i in response.json()]


def test_list_hides_background_unless_asked(client: TestClient) -> None:
    assert ids(client.get(f"{BASE}/instances")) == [1, 2, 3, 5, 6]
    assert 4 in ids(client.get(f"{BASE}/instances", params={"include_background": True}))


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"zone": "NW"}, [2, 3]),
        ({"zone": "SW - SE"}, [5]),
        ({"system": "S - 2"}, [5, 6]),
        ({"class_id": 8}, [3]),
        ({"review_status": "unreviewed"}, [1, 2, 3, 5, 6]),
        ({"review_status": "confirmed"}, []),
        ({"q": "psv"}, [1]),
        ({"q": "vg-5"}, [5]),
        ({"zone": "NE", "system": "S - 2"}, [6]),
    ],
)
def test_list_filters(client: TestClient, params: dict[str, Any], expected: list[int]) -> None:
    assert ids(client.get(f"{BASE}/instances", params=params)) == expected


def test_list_rejects_bad_filter_values(client: TestClient) -> None:
    assert client.get(f"{BASE}/instances", params={"review_status": "great"}).status_code == 422
    assert client.get(f"{BASE}/instances", params={"class_id": "pipe"}).status_code == 422


def test_instance_detail_has_fields_size_and_empty_history(client: TestClient) -> None:
    detail = client.get(f"{BASE}/instances/1").json()

    assert detail["class_name"] == "Piping components"
    assert detail["current_class_id"] == 20
    assert detail["tag"] == "PSV-1"
    assert detail["bbox_size"] == [0.2, 0.2, 0.2]
    assert detail["review_status"] == "unreviewed"
    assert detail["history"] == []


def test_unknown_instance_is_404_and_bad_id_is_422(client: TestClient) -> None:
    assert client.get(f"{BASE}/instances/999").status_code == 404
    assert client.get(f"{BASE}/instances/abc").status_code == 422


def test_patch_review_status_writes_an_event(client: TestClient) -> None:
    response = client.patch(
        f"{BASE}/instances/5", json={"review_status": "confirmed", "note": " looks right "}
    )

    assert response.status_code == 200
    assert response.json()["review_status"] == "confirmed"
    [event] = events(client, 5)
    assert event["action"] == "set_review_status"
    assert (event["from_value"], event["to_value"]) == ("unreviewed", "confirmed")
    assert event["note"] == "looks right"
    assert event["actor"] == "local user"
    assert event["issue_id"] is None


def test_patch_class_marks_object_corrected(client: TestClient) -> None:
    detail = client.patch(f"{BASE}/instances/1", json={"current_class_id": 12}).json()

    assert detail["current_class_id"] == 12
    assert detail["class_id"] == 20  # the annotation itself is kept
    assert detail["review_status"] == "corrected"
    assert [e["action"] for e in detail["history"]] == ["change_class", "set_review_status"]
    assert ids(client.get(f"{BASE}/instances", params={"class_id": 12})) == [1]


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"note": "only a note"},
        {"review_status": "great"},
        {"review_status": "confirmed", "colour": "red"},
        {"current_class_id": 99},  # not a class of this scan
    ],
)
def test_patch_rejects_invalid_changes_and_writes_nothing(
    client: TestClient, body: dict[str, Any]
) -> None:
    response = client.patch(f"{BASE}/instances/1", json=body)

    assert response.status_code == 422
    assert response.json()["detail"]
    detail = client.get(f"{BASE}/instances/1").json()
    assert (detail["current_class_id"], detail["review_status"]) == (20, "unreviewed")
    assert detail["history"] == []


def test_patch_unknown_instance_is_404(client: TestClient) -> None:
    assert (
        client.patch(f"{BASE}/instances/999", json={"review_status": "rejected"}).status_code == 404
    )


# ---------------------------------------------------------------- issues


def test_issues_sorted_high_to_low_and_filterable(client: TestClient) -> None:
    issues = client.get(f"{BASE}/issues").json()

    assert [i["severity"] for i in issues] == ["high", "medium", "medium", "low", "low"]
    assert all(i["status"] == "open" for i in issues)
    medium = client.get(f"{BASE}/issues", params={"severity": "medium"}).json()
    assert {i["issue_id"] for i in medium} == {
        "tag_missing_in_scan:PT-9",
        "untagged_equipment:2",
    }
    by_type = client.get(f"{BASE}/issues", params={"type": "tag_split"}).json()
    assert [i["issue_id"] for i in by_type] == ["tag_split:P-9"]
    assert client.get(f"{BASE}/issues", params={"severity": "urgent"}).status_code == 422


def resolve(client: TestClient, issue_id: str, body: dict[str, Any]) -> Any:
    return client.post(f"{BASE}/issues/{issue_id}/resolve", json=body)


def test_accept_suggestion_changes_class_and_closes_issue(client: TestClient) -> None:
    response = resolve(client, "class_mismatch:1", {"action": "accept_suggestion", "note": "ok"})

    assert response.status_code == 200
    result = response.json()
    assert result["issue"]["status"] == "resolved"
    [inst] = result["instances"]
    assert (inst["current_class_id"], inst["review_status"]) == (12, "corrected")
    actions = [(e["action"], e["issue_id"]) for e in inst["history"]]
    assert actions == [
        ("change_class", "class_mismatch:1"),
        ("set_review_status", "class_mismatch:1"),
        ("close_issue", "class_mismatch:1"),
    ]
    resolved = client.get(f"{BASE}/issues", params={"status": "resolved"}).json()
    assert [i["issue_id"] for i in resolved] == ["class_mismatch:1"]


def test_change_class_with_explicit_class(client: TestClient) -> None:
    result = resolve(client, "class_mismatch:1", {"action": "change_class", "class_id": 13})

    assert result.status_code == 200
    assert result.json()["instances"][0]["current_class_id"] == 13


def test_assign_tag_to_untagged_object(client: TestClient) -> None:
    result = resolve(client, "untagged_equipment:2", {"action": "assign_tag", "tag": " PT-9 "})

    assert result.status_code == 200
    inst = result.json()["instances"][0]
    assert (inst["tag"], inst["all_tags"], inst["has_tag"]) == ("PT-9", ["PT-9"], True)
    assert inst["review_status"] == "corrected"
    assert inst["history"][0]["action"] == "assign_tag"


def test_dismiss_issue_without_objects_records_a_scan_level_event(client: TestClient) -> None:
    result = resolve(client, "tag_missing_in_scan:PT-9", {"action": "dismiss", "note": "removed"})

    assert result.status_code == 200
    assert result.json()["issue"]["status"] == "dismissed"
    assert result.json()["instances"] == []
    [event] = result.json()["issue"]["history"]  # no object, so only the issue holds it
    assert event["instance_id"] is None
    assert (event["action"], event["to_value"], event["note"]) == (
        "close_issue",
        "dismissed",
        "removed",
    )


def test_issues_carry_their_history_who_when_what(client: TestClient) -> None:
    resolve(client, "class_mismatch:1", {"action": "accept_suggestion", "note": "P&ID wins"})

    issues = {i["issue_id"]: i for i in client.get(f"{BASE}/issues").json()}

    assert issues["tag_split:P-9"]["history"] == []  # still open
    history = issues["class_mismatch:1"]["history"]
    assert [(e["action"], e["to_value"]) for e in history] == [
        ("change_class", "12"),
        ("set_review_status", "corrected"),
        ("close_issue", "resolved"),
    ]
    assert {e["actor"] for e in history} == {"local user"}
    assert all(e["created_at"] and e["note"] == "P&ID wins" for e in history)


@pytest.mark.parametrize(
    ("issue_id", "body"),
    [
        ("untagged_equipment:2", {"action": "accept_suggestion"}),  # no class suggestion
        ("tag_split:P-9", {"action": "assign_tag", "tag": "X"}),  # two objects
        ("tag_missing_in_scan:PT-9", {"action": "change_class", "class_id": 4}),  # no objects
        ("class_mismatch:1", {"action": "change_class"}),  # class missing
        ("class_mismatch:1", {"action": "change_class", "class_id": 99}),  # unknown class
        ("class_mismatch:1", {"action": "assign_tag", "tag": "   "}),  # empty tag
        ("class_mismatch:1", {"action": "delete"}),
    ],
)
def test_resolve_rejects_invalid_resolutions_and_writes_nothing(
    client: TestClient, issue_id: str, body: dict[str, Any]
) -> None:
    response = resolve(client, issue_id, body)

    assert response.status_code == 422
    issue = next(i for i in client.get(f"{BASE}/issues").json() if i["issue_id"] == issue_id)
    assert issue["status"] == "open"
    assert all(events(client, i) == [] for i in issue["instance_ids"])


def test_resolving_twice_is_a_conflict(client: TestClient) -> None:
    assert resolve(client, "estimate_unreliable:3", {"action": "dismiss"}).status_code == 200

    second = resolve(client, "estimate_unreliable:3", {"action": "dismiss"})

    assert second.status_code == 409
    assert "already dismissed" in second.json()["detail"]


def test_unknown_issue_is_404(client: TestClient) -> None:
    assert resolve(client, "nope:1", {"action": "dismiss"}).status_code == 404


def test_failed_resolve_writes_nothing(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """The class change is made, then writing the status fails: everything must roll back."""
    from app import services

    def boom(*_: Any) -> None:
        raise RuntimeError("database went away")

    monkeypatch.setattr(services, "_set_status", boom)

    response = resolve(client, "class_mismatch:1", {"action": "accept_suggestion"})

    assert response.status_code == 500
    monkeypatch.undo()
    detail = client.get(f"{BASE}/instances/1").json()
    assert detail["current_class_id"] == 20
    assert detail["history"] == []
    issue = client.get(f"{BASE}/issues", params={"type": "class_mismatch"}).json()[0]
    assert issue["status"] == "open"


def test_failed_patch_writes_nothing(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app import services

    def boom(*_: Any) -> None:
        raise RuntimeError("disk full")

    monkeypatch.setattr(services, "_set_status", boom)

    assert client.patch(f"{BASE}/instances/1", json={"current_class_id": 12}).status_code == 500
    monkeypatch.undo()
    detail = client.get(f"{BASE}/instances/1").json()
    assert (detail["current_class_id"], detail["history"]) == (20, [])


# ---------------------------------------------------------------- contract


def test_openapi_lists_every_endpoint_with_schemas(client: TestClient) -> None:
    spec = client.get("/openapi.json").json()

    assert set(spec["paths"]) == {
        "/api/health",
        "/api/scans/{scan_id}",
        "/api/scans/{scan_id}/instances",
        "/api/scans/{scan_id}/instances/{instance_id}",
        "/api/scans/{scan_id}/issues",
        "/api/scans/{scan_id}/issues/{issue_id}/resolve",
    }
    for name in ("ScanMeta", "InstanceOut", "InstanceDetail", "IssueOut", "ResolveResult"):
        assert name in spec["components"]["schemas"]


def test_cors_allows_only_the_local_web_origin(client: TestClient) -> None:
    allowed = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    other = client.get("/api/health", headers={"Origin": "https://evil.example"})

    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in other.headers
