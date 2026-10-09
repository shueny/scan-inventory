"""Database tables (ADR 0008).

Point data never goes into Postgres; only the inventory seeded from the pipeline's JSON
files and what users change: review status, corrected class, assigned tags, issue status,
and the append-only review_event history.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

REVIEW_STATUSES = ("unreviewed", "confirmed", "corrected", "rejected")
SEVERITIES = ("high", "medium", "low")
ISSUE_STATUSES = ("open", "resolved", "dismissed")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Base(DeclarativeBase):
    pass


class Scan(Base):
    __tablename__ = "scan"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text)
    licence: Mapped[str] = mapped_column(Text)
    doi: Mapped[str] = mapped_column(Text)
    point_count: Mapped[int] = mapped_column(BigInteger)
    zones: Mapped[list[str]] = mapped_column(ARRAY(Text))  # display order


class ScanClass(Base):
    """Class list of a scan with display colours (from data/scan.json)."""

    __tablename__ = "scan_class"

    scan_id: Mapped[str] = mapped_column(ForeignKey("scan.id"), primary_key=True)
    class_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(7))
    is_background: Mapped[bool] = mapped_column(Boolean)


class Instance(Base):
    __tablename__ = "instance"
    __table_args__ = (
        # Both the annotated and the current class must exist in the scan's class list.
        ForeignKeyConstraint(
            ["scan_id", "class_id"], ["scan_class.scan_id", "scan_class.class_id"]
        ),
        ForeignKeyConstraint(
            ["scan_id", "current_class_id"], ["scan_class.scan_id", "scan_class.class_id"]
        ),
        CheckConstraint(_in("review_status", REVIEW_STATUSES), name="review_status_valid"),
    )

    scan_id: Mapped[str] = mapped_column(ForeignKey("scan.id"), primary_key=True)
    instance_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    class_id: Mapped[int] = mapped_column(Integer)  # as annotated, never changes
    is_background: Mapped[bool] = mapped_column(Boolean)
    point_count: Mapped[int] = mapped_column(Integer)
    centroid: Mapped[list[float]] = mapped_column(ARRAY(Float))
    bbox_min: Mapped[list[float]] = mapped_column(ARRAY(Float))
    bbox_max: Mapped[list[float]] = mapped_column(ARRAY(Float))
    length_est_m: Mapped[float | None] = mapped_column(Float)
    diameter_est_m: Mapped[float | None] = mapped_column(Float)
    has_tag: Mapped[bool] = mapped_column(Boolean)
    tag: Mapped[str | None] = mapped_column(Text)
    all_tags: Mapped[list[str]] = mapped_column(ARRAY(Text))
    element: Mapped[str | None] = mapped_column(Text)
    nominal_inch: Mapped[float | None] = mapped_column(Float)
    system: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(Text)  # zone; same name as the pipeline
    location_source: Mapped[str] = mapped_column(String(32))
    # Changed by review:
    review_status: Mapped[str] = mapped_column(String(16), default="unreviewed")
    current_class_id: Mapped[int] = mapped_column(Integer)


class Issue(Base):
    __tablename__ = "issue"
    __table_args__ = (
        CheckConstraint(_in("severity", SEVERITIES), name="severity_valid"),
        CheckConstraint(_in("status", ISSUE_STATUSES), name="issue_status_valid"),
    )

    scan_id: Mapped[str] = mapped_column(ForeignKey("scan.id"), primary_key=True)
    issue_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    type: Mapped[str] = mapped_column(String(32))
    severity: Mapped[str] = mapped_column(String(8))
    instance_ids: Mapped[list[int]] = mapped_column(ARRAY(Integer))
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text))
    title: Mapped[str] = mapped_column(Text)
    detail: Mapped[str] = mapped_column(Text)
    suggested_action: Mapped[str | None] = mapped_column(String(32))
    suggested_class_id: Mapped[int | None] = mapped_column(Integer)
    candidate_tags: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(16), default="open")
    sort_order: Mapped[int] = mapped_column(Integer)  # order in issues.json


class ReviewEvent(Base):
    """Append-only audit history. Rows are only ever inserted."""

    __tablename__ = "review_event"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scan.id"), index=True)
    # Null for issue-level events that touch no object (e.g. dismissing a missing tag).
    instance_id: Mapped[int | None] = mapped_column(Integer, index=True)
    issue_id: Mapped[str | None] = mapped_column(String(128))
    action: Mapped[str] = mapped_column(String(32))
    from_value: Mapped[str | None] = mapped_column(Text)
    to_value: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(Text, default="local user")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
