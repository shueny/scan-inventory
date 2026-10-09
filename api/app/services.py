"""Business logic: reads, review changes and issue resolution.

Every write runs in one transaction (`_write`): either all rows change and the events are
written, or nothing is (PRD 8.2). Routes only translate HTTP to these functions.
"""

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import models, schemas

log = logging.getLogger("scan_inventory.review")

SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2}


class NotFoundError(Exception):
    pass


class InvalidChangeError(Exception):
    """A request that is well-formed but not allowed (HTTP 422)."""


class ConflictError(Exception):
    """The request conflicts with the current state, e.g. issue already closed (HTTP 409)."""


@dataclass(frozen=True)
class InstanceFilters:
    zone: str | None = None
    system: str | None = None
    class_id: int | None = None  # matches the current (possibly corrected) class
    review_status: str | None = None
    q: str | None = None  # tag search, case-insensitive substring
    include_background: bool = False


@contextmanager
def _write(session: Session) -> Iterator[None]:
    try:
        yield
        session.commit()
    except Exception:
        session.rollback()
        raise


# ---------------------------------------------------------------- reads


def _scan(session: Session, scan_id: str) -> models.Scan:
    scan = session.get(models.Scan, scan_id)
    if scan is None:
        raise NotFoundError(f"scan {scan_id}")
    return scan


def _class_names(session: Session, scan_id: str) -> dict[int, str]:
    rows = session.execute(
        select(models.ScanClass.class_id, models.ScanClass.name).where(
            models.ScanClass.scan_id == scan_id
        )
    )
    return {class_id: name for class_id, name in rows}


def _instance_out(inst: models.Instance, class_names: dict[int, str]) -> schemas.InstanceOut:
    return schemas.InstanceOut.model_validate(
        {
            **{c.key: getattr(inst, c.key) for c in models.Instance.__table__.columns},
            "class_name": class_names[inst.class_id],
            "bbox_size": [
                round(hi - lo, 4) for lo, hi in zip(inst.bbox_min, inst.bbox_max, strict=True)
            ],
        }
    )


def _history(session: Session, scan_id: str, instance_id: int) -> list[schemas.ReviewEventOut]:
    events = session.scalars(
        select(models.ReviewEvent)
        .where(
            models.ReviewEvent.scan_id == scan_id,
            models.ReviewEvent.instance_id == instance_id,
        )
        .order_by(models.ReviewEvent.created_at, models.ReviewEvent.id)
    )
    return [schemas.ReviewEventOut.model_validate(e) for e in events]


def get_scan_meta(session: Session, scan_id: str) -> schemas.ScanMeta:
    scan = _scan(session, scan_id)
    counts = dict(
        session.execute(
            select(models.Instance.class_id, func.count())
            .where(models.Instance.scan_id == scan_id)
            .group_by(models.Instance.class_id)
        ).all()
    )
    classes = session.scalars(
        select(models.ScanClass)
        .where(models.ScanClass.scan_id == scan_id)
        .order_by(models.ScanClass.class_id)
    )
    return schemas.ScanMeta(
        scan_id=scan.id,
        name=scan.name,
        source=scan.source,
        licence=scan.licence,
        doi=scan.doi,
        instance_count=sum(counts.values()),
        point_count=scan.point_count,
        classes=[
            schemas.ClassInfo(
                id=c.class_id,
                name=c.name,
                color=c.color,
                is_background=c.is_background,
                instance_count=counts.get(c.class_id, 0),
            )
            for c in classes
        ],
        zones=scan.zones,
    )


def list_instances(
    session: Session, scan_id: str, filters: InstanceFilters
) -> list[schemas.InstanceOut]:
    _scan(session, scan_id)
    i = models.Instance
    query = select(i).where(i.scan_id == scan_id).order_by(i.instance_id)
    if not filters.include_background:
        query = query.where(i.is_background.is_(False))
    if filters.zone is not None:
        query = query.where(i.location == filters.zone)
    if filters.system is not None:
        query = query.where(i.system == filters.system)
    if filters.class_id is not None:
        query = query.where(i.current_class_id == filters.class_id)
    if filters.review_status is not None:
        query = query.where(i.review_status == filters.review_status)
    if filters.q:
        pattern = f"%{filters.q.strip()}%"
        any_tag = func.array_to_string(i.all_tags, " ").ilike(pattern)
        query = query.where(or_(i.tag.ilike(pattern), any_tag))
    names = _class_names(session, scan_id)
    return [_instance_out(inst, names) for inst in session.scalars(query)]


def _get_instance(session: Session, scan_id: str, instance_id: int) -> models.Instance:
    inst = session.get(models.Instance, (scan_id, instance_id))
    if inst is None:
        raise NotFoundError(f"instance {instance_id} in scan {scan_id}")
    return inst


def get_instance_detail(session: Session, scan_id: str, instance_id: int) -> schemas.InstanceDetail:
    _scan(session, scan_id)
    inst = _get_instance(session, scan_id, instance_id)
    out = _instance_out(inst, _class_names(session, scan_id))
    return schemas.InstanceDetail(
        **out.model_dump(), history=_history(session, scan_id, instance_id)
    )


def list_issues(
    session: Session,
    scan_id: str,
    status: str | None = None,
    severity: str | None = None,
    issue_type: str | None = None,
) -> list[schemas.IssueOut]:
    _scan(session, scan_id)
    query = select(models.Issue).where(models.Issue.scan_id == scan_id)
    if status is not None:
        query = query.where(models.Issue.status == status)
    if severity is not None:
        query = query.where(models.Issue.severity == severity)
    if issue_type is not None:
        query = query.where(models.Issue.type == issue_type)
    issues = sorted(session.scalars(query), key=lambda x: (SEVERITY_RANK[x.severity], x.sort_order))
    return [schemas.IssueOut.model_validate(x) for x in issues]


# ---------------------------------------------------------------- writes


def _event(
    session: Session,
    inst_or_scan: models.Instance | str,
    action: str,
    from_value: object,
    to_value: object,
    note: str | None,
    issue_id: str | None = None,
) -> None:
    if isinstance(inst_or_scan, models.Instance):
        scan_id, instance_id = inst_or_scan.scan_id, inst_or_scan.instance_id
    else:
        scan_id, instance_id = inst_or_scan, None
    session.add(
        models.ReviewEvent(
            scan_id=scan_id,
            instance_id=instance_id,
            issue_id=issue_id,
            action=action,
            from_value=None if from_value is None else str(from_value),
            to_value=None if to_value is None else str(to_value),
            note=note or None,
        )
    )
    log.info(
        "review action scan=%s instance=%s issue=%s action=%s %s->%s",
        scan_id,
        instance_id,
        issue_id,
        action,
        from_value,
        to_value,
    )


def _check_class(session: Session, scan_id: str, class_id: int) -> None:
    if session.get(models.ScanClass, (scan_id, class_id)) is None:
        raise InvalidChangeError(f"class {class_id} does not exist in scan {scan_id}")


def _set_status(
    session: Session, inst: models.Instance, status: str, note: str | None, issue_id: str | None
) -> None:
    if inst.review_status != status:
        _event(session, inst, "set_review_status", inst.review_status, status, note, issue_id)
        inst.review_status = status


def _change_class(
    session: Session, inst: models.Instance, class_id: int, note: str | None, issue_id: str | None
) -> None:
    _check_class(session, inst.scan_id, class_id)
    if inst.current_class_id != class_id:
        _event(session, inst, "change_class", inst.current_class_id, class_id, note, issue_id)
        inst.current_class_id = class_id


def update_instance(
    session: Session, scan_id: str, instance_id: int, change: schemas.InstanceChange
) -> schemas.InstanceDetail:
    """Change review status and/or class. Changing the class without a status marks the
    object as corrected."""
    _scan(session, scan_id)
    with _write(session):
        inst = _get_instance(session, scan_id, instance_id)
        if change.current_class_id is not None:
            _change_class(session, inst, change.current_class_id, change.note, None)
        status = change.review_status
        if status is None and change.current_class_id is not None:
            status = "corrected"
        if status is not None:
            _set_status(session, inst, status, change.note, None)
    return get_instance_detail(session, scan_id, instance_id)


def resolve_issue(
    session: Session, scan_id: str, issue_id: str, resolution: schemas.Resolution
) -> schemas.ResolveResult:
    """Apply a resolution to the issue and its objects, all in one transaction."""
    _scan(session, scan_id)
    with _write(session):
        issue = session.get(models.Issue, (scan_id, issue_id))
        if issue is None:
            raise NotFoundError(f"issue {issue_id}")
        if issue.status != "open":
            raise ConflictError(f"issue {issue_id} is already {issue.status}")
        instances = [_get_instance(session, scan_id, i) for i in issue.instance_ids]
        note = resolution.note
        action: str = resolution.action
        class_id: int | None = resolution.class_id

        if action == "accept_suggestion":
            if issue.suggested_action != "change_class" or issue.suggested_class_id is None:
                raise InvalidChangeError(
                    "this issue has no class suggestion to accept; use assign_tag or dismiss"
                )
            action, class_id = "change_class", issue.suggested_class_id

        if action == "change_class":
            if not instances or class_id is None:
                raise InvalidChangeError("change_class needs an issue with objects and a class")
            for inst in instances:
                _change_class(session, inst, class_id, note, issue_id)
                _set_status(session, inst, "corrected", note, issue_id)
        elif action == "assign_tag":
            if len(instances) != 1 or resolution.tag is None:
                raise InvalidChangeError("assign_tag needs an issue with exactly one object")
            inst = instances[0]
            _event(session, inst, "assign_tag", inst.tag, resolution.tag, note, issue_id)
            if inst.tag is None:
                inst.tag = resolution.tag
            if resolution.tag not in inst.all_tags:
                inst.all_tags = [*inst.all_tags, resolution.tag]
            inst.has_tag = True
            _set_status(session, inst, "corrected", note, issue_id)

        new_status = "dismissed" if action == "dismiss" else "resolved"
        targets: list[models.Instance | str] = [*instances] if instances else [scan_id]
        for target in targets:
            _event(session, target, "close_issue", issue.status, new_status, note, issue_id)
        issue.status = new_status

    return schemas.ResolveResult(
        issue=schemas.IssueOut.model_validate(issue),
        instances=[get_instance_detail(session, scan_id, i.instance_id) for i in instances],
    )
