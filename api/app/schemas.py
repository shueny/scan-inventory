"""Request and response models. They define the OpenAPI schema the frontend types are
generated from (T5), so every endpoint uses them."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

ReviewStatus = Literal["unreviewed", "confirmed", "corrected", "rejected"]
Severity = Literal["high", "medium", "low"]
IssueStatus = Literal["open", "resolved", "dismissed"]
IssueType = Literal[
    "class_mismatch",
    "tag_missing_in_scan",
    "untagged_equipment",
    "tag_split",
    "estimate_unreliable",
    "zone_borrowed",
]
LocationSource = Literal["pnid", "tagged_nearest_tag", "nearest_tag", "background"]
Vec3 = Annotated[list[float], Field(min_length=3, max_length=3)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]


class ClassInfo(BaseModel):
    id: int
    name: str
    color: str
    is_background: bool
    instance_count: int


class ScanMeta(BaseModel):
    scan_id: str
    name: str
    source: str
    licence: str
    doi: str
    instance_count: int
    point_count: int
    classes: list[ClassInfo]
    zones: list[str]


class InstanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    scan_id: str
    instance_id: int
    class_id: int
    class_name: str
    is_background: bool
    point_count: int
    centroid: Vec3
    bbox_min: Vec3
    bbox_max: Vec3
    bbox_size: Vec3
    length_est_m: float | None
    diameter_est_m: float | None
    has_tag: bool
    tag: str | None
    all_tags: list[str]
    element: str | None
    nominal_inch: float | None
    system: str | None
    location: str | None
    location_source: LocationSource
    review_status: ReviewStatus
    current_class_id: int


class ReviewEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    scan_id: str
    instance_id: int | None
    issue_id: str | None
    action: str
    from_value: str | None
    to_value: str | None
    note: str | None
    actor: str
    created_at: datetime


class InstanceDetail(InstanceOut):
    history: list[ReviewEventOut]


class InstanceChange(BaseModel):
    """PATCH body. At least one of review_status and current_class_id."""

    model_config = ConfigDict(extra="forbid")

    review_status: ReviewStatus | None = None
    current_class_id: int | None = None
    note: Note | None = None

    @model_validator(mode="after")
    def something_changes(self) -> "InstanceChange":
        if self.review_status is None and self.current_class_id is None:
            raise ValueError("give review_status and/or current_class_id")
        return self


class CandidateTag(BaseModel):
    tag: str
    system: str | None
    distance_m: float | None


class IssueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    issue_id: str
    type: IssueType
    severity: Severity
    instance_ids: list[int]
    tags: list[str]
    title: str
    detail: str
    suggested_action: Literal["change_class", "assign_tag"] | None
    suggested_class_id: int | None
    candidate_tags: list[CandidateTag]
    status: IssueStatus


class Resolution(BaseModel):
    """POST .../resolve body."""

    model_config = ConfigDict(extra="forbid")

    action: Literal["accept_suggestion", "change_class", "assign_tag", "dismiss"]
    class_id: int | None = None
    tag: Tag | None = None
    note: Note | None = None

    @model_validator(mode="after")
    def required_fields(self) -> "Resolution":
        if self.action == "change_class" and self.class_id is None:
            raise ValueError("change_class needs class_id")
        if self.action == "assign_tag" and self.tag is None:
            raise ValueError("assign_tag needs tag")
        return self


class ResolveResult(BaseModel):
    issue: IssueOut
    instances: list[InstanceDetail]


class Health(BaseModel):
    status: Literal["ok"]
