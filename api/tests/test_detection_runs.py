"""Detection runs (T14, ADR 0021): run 1 from the seed and from migration 0002."""

import json
from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Connection, Engine, create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker

from app import models
from tests.conftest import API_DIR, FIXTURES


def test_seed_stores_the_inventory_as_run_1(sessions: sessionmaker[Session]) -> None:
    records = {
        r["instance_id"]: r
        for r in json.loads((FIXTURES / "instances.json").read_text())["instances"]
    }
    with sessions() as session:
        [run] = session.scalars(select(models.DetectionRun)).all()
        detections = session.scalars(select(models.Detection)).all()
        links = session.scalars(select(models.DetectionLink)).all()
        instances = session.scalars(select(models.Instance)).all()

    assert (run.scan_id, run.run_no, run.source) == ("test", 1, "instances.json")
    assert {d.detection_id: d.raw for d in detections} == records
    assert {(lk.detection_id, lk.instance_id, lk.kind) for lk in links} == {
        (i, i, "initial") for i in records
    }
    assert {i.latest_run_id for i in instances} == {run.id}


def test_review_event_records_the_current_run(
    client: TestClient, sessions: sessionmaker[Session]
) -> None:
    client.patch("/api/scans/test/instances/5", json={"review_status": "confirmed"})

    with sessions() as session:
        run_id = session.scalar(select(models.DetectionRun.id))
        [event] = session.scalars(select(models.ReviewEvent)).all()
    assert (event.instance_id, event.run_id) == (5, run_id)


# ---------------------------------------------------------------- migration 0002


@pytest.fixture
def old_database(engine: Engine) -> Iterator[tuple[Config, Engine]]:
    """A separate database at revision 0001, like one created before T14."""
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        # FORCE: Alembic's env.py leaves its own connections open after a migration.
        conn.execute(text("DROP DATABASE IF EXISTS before_t14 WITH (FORCE)"))
        conn.execute(text("CREATE DATABASE before_t14"))
    url = engine.url.set(database="before_t14").render_as_string(hide_password=False)
    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(API_DIR / "migrations"))
    config.attributes["database_url"] = url
    command.upgrade(config, "0001")
    old = create_engine(url)
    yield config, old
    old.dispose()


def _insert_reviewed_scan(conn: Connection) -> None:
    conn.execute(
        text(
            "INSERT INTO scan VALUES ('s', 'S', 'src', 'CC BY 4.0', 'doi', 10, ARRAY['NW']);"
            "INSERT INTO scan_class VALUES ('s', 8, 'Pipe', '#000000', false);"
            "INSERT INTO instance VALUES ('s', 7, 8, false, 100, ARRAY[1.0, 2.0, 3.0],"
            " ARRAY[0.0, 0.0, 0.0], ARRAY[2.0, 4.0, 6.0], 2.0, 0.1, false, NULL,"
            " ARRAY[]::text[], NULL, NULL, NULL, 'NW', 'pnid', 'confirmed', 8);"
            "INSERT INTO review_event (scan_id, instance_id, action, from_value, to_value, actor)"
            " VALUES ('s', 7, 'set_review_status', 'unreviewed', 'confirmed', 'local user');"
        )
    )


def test_migration_turns_existing_rows_into_run_1(old_database: tuple[Config, Engine]) -> None:
    config, old = old_database
    with old.begin() as conn:
        _insert_reviewed_scan(conn)

    command.upgrade(config, "head")

    with old.connect() as conn:
        run_id, run_no = conn.execute(text("SELECT id, run_no FROM detection_run")).one()
        detection = conn.execute(
            text("SELECT detection_id, class_id, bbox_max, raw FROM detection")
        ).one()
        link = conn.execute(text("SELECT instance_id, kind FROM detection_link")).one()
        inst = conn.execute(
            text("SELECT review_status, latest_run_id FROM instance WHERE instance_id = 7")
        ).one()
        event_run = conn.execute(text("SELECT run_id FROM review_event")).scalar_one()

    assert run_no == 1
    assert detection[:3] == (7, 8, [2.0, 4.0, 6.0])
    assert "review_status" not in detection.raw and detection.raw["location"] == "NW"
    assert tuple(link) == (7, "initial")
    assert tuple(inst) == ("confirmed", run_id)  # the review decision is kept
    assert event_run == run_id


def test_migration_downgrade_keeps_the_review_state(old_database: tuple[Config, Engine]) -> None:
    config, old = old_database
    with old.begin() as conn:
        _insert_reviewed_scan(conn)
    command.upgrade(config, "head")

    command.downgrade(config, "0001")

    with old.connect() as conn:
        status = conn.execute(text("SELECT review_status FROM instance")).scalar_one()
        tables = conn.execute(
            text("SELECT count(*) FROM pg_tables WHERE tablename LIKE 'detection%'")
        ).scalar_one()
    assert (status, tables) == ("confirmed", 0)
