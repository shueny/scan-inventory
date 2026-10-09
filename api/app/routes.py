"""HTTP endpoints (PRD 8.2), prefix /api. Thin: parse, call a service, return a schema."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import schemas, services
from app.db import get_session

router = APIRouter(prefix="/api")
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/health", response_model=schemas.Health)
def health() -> schemas.Health:
    return schemas.Health(status="ok")


@router.get("/scans/{scan_id}", response_model=schemas.ScanMeta)
def get_scan(scan_id: str, session: SessionDep) -> schemas.ScanMeta:
    return services.get_scan_meta(session, scan_id)


@router.get("/scans/{scan_id}/instances", response_model=list[schemas.InstanceOut])
def list_instances(
    scan_id: str,
    session: SessionDep,
    zone: str | None = None,
    system: str | None = None,
    class_id: int | None = None,
    review_status: schemas.ReviewStatus | None = None,
    q: Annotated[str | None, Query(max_length=64, description="tag search")] = None,
    include_background: bool = False,
) -> list[schemas.InstanceOut]:
    filters = services.InstanceFilters(
        zone=zone,
        system=system,
        class_id=class_id,
        review_status=review_status,
        q=q,
        include_background=include_background,
    )
    return services.list_instances(session, scan_id, filters)


@router.get("/scans/{scan_id}/instances/{instance_id}", response_model=schemas.InstanceDetail)
def get_instance(scan_id: str, instance_id: int, session: SessionDep) -> schemas.InstanceDetail:
    return services.get_instance_detail(session, scan_id, instance_id)


@router.patch("/scans/{scan_id}/instances/{instance_id}", response_model=schemas.InstanceDetail)
def update_instance(
    scan_id: str, instance_id: int, change: schemas.InstanceChange, session: SessionDep
) -> schemas.InstanceDetail:
    return services.update_instance(session, scan_id, instance_id, change)


@router.get("/scans/{scan_id}/issues", response_model=list[schemas.IssueOut])
def list_issues(
    scan_id: str,
    session: SessionDep,
    status: schemas.IssueStatus | None = None,
    severity: schemas.Severity | None = None,
    type: schemas.IssueType | None = None,  # noqa: A002 - query parameter name from the PRD
) -> list[schemas.IssueOut]:
    return services.list_issues(session, scan_id, status, severity, type)


@router.post("/scans/{scan_id}/issues/{issue_id}/resolve", response_model=schemas.ResolveResult)
def resolve_issue(
    scan_id: str, issue_id: str, resolution: schemas.Resolution, session: SessionDep
) -> schemas.ResolveResult:
    return services.resolve_issue(session, scan_id, issue_id, resolution)
