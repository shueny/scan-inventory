"""initial schema: scan, scan_class, instance, issue, review_event

Revision ID: 0001
Revises:
Create Date: 2026-10-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "scan",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("licence", sa.Text(), nullable=False),
        sa.Column("doi", sa.Text(), nullable=False),
        sa.Column("point_count", sa.BigInteger(), nullable=False),
        sa.Column("zones", postgresql.ARRAY(sa.Text()), nullable=False),
    )
    op.create_table(
        "scan_class",
        sa.Column("scan_id", sa.String(64), sa.ForeignKey("scan.id"), primary_key=True),
        sa.Column("class_id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("color", sa.String(7), nullable=False),
        sa.Column("is_background", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "instance",
        sa.Column("scan_id", sa.String(64), sa.ForeignKey("scan.id"), primary_key=True),
        sa.Column("instance_id", sa.Integer(), primary_key=True),
        sa.Column("class_id", sa.Integer(), nullable=False),
        sa.Column("is_background", sa.Boolean(), nullable=False),
        sa.Column("point_count", sa.Integer(), nullable=False),
        sa.Column("centroid", postgresql.ARRAY(sa.Float()), nullable=False),
        sa.Column("bbox_min", postgresql.ARRAY(sa.Float()), nullable=False),
        sa.Column("bbox_max", postgresql.ARRAY(sa.Float()), nullable=False),
        sa.Column("length_est_m", sa.Float(), nullable=True),
        sa.Column("diameter_est_m", sa.Float(), nullable=True),
        sa.Column("has_tag", sa.Boolean(), nullable=False),
        sa.Column("tag", sa.Text(), nullable=True),
        sa.Column("all_tags", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("element", sa.Text(), nullable=True),
        sa.Column("nominal_inch", sa.Float(), nullable=True),
        sa.Column("system", sa.Text(), nullable=True),
        sa.Column("location", sa.Text(), nullable=True),
        sa.Column("location_source", sa.String(32), nullable=False),
        sa.Column("review_status", sa.String(16), nullable=False),
        sa.Column("current_class_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["scan_id", "class_id"], ["scan_class.scan_id", "scan_class.class_id"]
        ),
        sa.ForeignKeyConstraint(
            ["scan_id", "current_class_id"], ["scan_class.scan_id", "scan_class.class_id"]
        ),
        sa.CheckConstraint(
            "review_status IN ('unreviewed', 'confirmed', 'corrected', 'rejected')",
            name="review_status_valid",
        ),
    )
    op.create_table(
        "issue",
        sa.Column("scan_id", sa.String(64), sa.ForeignKey("scan.id"), primary_key=True),
        sa.Column("issue_id", sa.String(128), primary_key=True),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("severity", sa.String(8), nullable=False),
        sa.Column("instance_ids", postgresql.ARRAY(sa.Integer()), nullable=False),
        sa.Column("tags", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column("suggested_action", sa.String(32), nullable=True),
        sa.Column("suggested_class_id", sa.Integer(), nullable=True),
        sa.Column("candidate_tags", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.CheckConstraint("severity IN ('high', 'medium', 'low')", name="severity_valid"),
        sa.CheckConstraint(
            "status IN ('open', 'resolved', 'dismissed')", name="issue_status_valid"
        ),
    )
    op.create_table(
        "review_event",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("scan_id", sa.String(64), sa.ForeignKey("scan.id"), nullable=False),
        sa.Column("instance_id", sa.Integer(), nullable=True),
        sa.Column("issue_id", sa.String(128), nullable=True),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("from_value", sa.Text(), nullable=True),
        sa.Column("to_value", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("actor", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_review_event_scan_id", "review_event", ["scan_id"])
    op.create_index("ix_review_event_instance_id", "review_event", ["instance_id"])


def downgrade() -> None:
    op.drop_table("review_event")
    op.drop_table("issue")
    op.drop_table("instance")
    op.drop_table("scan_class")
    op.drop_table("scan")
