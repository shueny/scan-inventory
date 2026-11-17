"""detection runs: detection_run, detection, detection_link (ADR 0021)

Existing rows become run 1 of their scan: one detection and one "initial" link per
instance, and every existing review event is dated to run 1. Review state is kept.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MIGRATED_SOURCE = "instance table before migration 0002"


def upgrade() -> None:
    op.create_table(
        "detection_run",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("scan_id", sa.String(64), sa.ForeignKey("scan.id"), nullable=False),
        sa.Column("run_no", sa.Integer(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column(
            "imported_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("scan_id", "run_no", name="detection_run_scan_run_no"),
    )
    op.create_table(
        "detection",
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("detection_run.id"), primary_key=True),
        sa.Column("detection_id", sa.Integer(), primary_key=True),
        sa.Column("class_id", sa.Integer(), nullable=False),
        sa.Column("point_count", sa.Integer(), nullable=False),
        sa.Column("centroid", postgresql.ARRAY(sa.Float()), nullable=False),
        sa.Column("bbox_min", postgresql.ARRAY(sa.Float()), nullable=False),
        sa.Column("bbox_max", postgresql.ARRAY(sa.Float()), nullable=False),
        sa.Column("raw", postgresql.JSONB(), nullable=False),
    )
    op.create_table(
        "detection_link",
        sa.Column("run_id", sa.Integer(), primary_key=True),
        sa.Column("detection_id", sa.Integer(), primary_key=True),
        sa.Column("scan_id", sa.String(64), nullable=False),
        sa.Column("instance_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("iou", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(
            ["run_id", "detection_id"], ["detection.run_id", "detection.detection_id"]
        ),
        sa.ForeignKeyConstraint(
            ["scan_id", "instance_id"], ["instance.scan_id", "instance.instance_id"]
        ),
        sa.CheckConstraint(
            "kind IN ('initial', 'same', 'split', 'merge', 'uncertain', 'added')",
            name="link_kind_valid",
        ),
    )
    op.create_index("ix_detection_link_instance_id", "detection_link", ["instance_id"])
    op.add_column("instance", sa.Column("latest_run_id", sa.Integer(), nullable=True))
    op.add_column("review_event", sa.Column("run_id", sa.Integer(), nullable=True))

    op.execute(
        sa.text(
            "INSERT INTO detection_run (scan_id, run_no, source) SELECT id, 1, :source FROM scan"
        ).bindparams(source=MIGRATED_SOURCE)
    )
    op.execute(
        """
        INSERT INTO detection
            (run_id, detection_id, class_id, point_count, centroid, bbox_min, bbox_max, raw)
        SELECT r.id, i.instance_id, i.class_id, i.point_count, i.centroid, i.bbox_min,
               i.bbox_max, to_jsonb(i) - 'review_status' - 'current_class_id' - 'latest_run_id'
        FROM instance i JOIN detection_run r ON r.scan_id = i.scan_id AND r.run_no = 1
        """
    )
    op.execute(
        """
        INSERT INTO detection_link (run_id, detection_id, scan_id, instance_id, kind)
        SELECT r.id, i.instance_id, i.scan_id, i.instance_id, 'initial'
        FROM instance i JOIN detection_run r ON r.scan_id = i.scan_id AND r.run_no = 1
        """
    )
    for table in ("instance", "review_event"):
        column = "latest_run_id" if table == "instance" else "run_id"
        op.execute(
            f"UPDATE {table} t SET {column} = r.id FROM detection_run r "
            "WHERE r.scan_id = t.scan_id AND r.run_no = 1"
        )
        op.alter_column(table, column, nullable=False)
    op.create_foreign_key(
        "instance_latest_run_id_fkey", "instance", "detection_run", ["latest_run_id"], ["id"]
    )
    op.create_foreign_key(
        "review_event_run_id_fkey", "review_event", "detection_run", ["run_id"], ["id"]
    )


def downgrade() -> None:
    op.drop_constraint("review_event_run_id_fkey", "review_event", type_="foreignkey")
    op.drop_constraint("instance_latest_run_id_fkey", "instance", type_="foreignkey")
    op.drop_column("review_event", "run_id")
    op.drop_column("instance", "latest_run_id")
    op.drop_table("detection_link")
    op.drop_table("detection")
    op.drop_table("detection_run")
