from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app import models
from app.models import Base
from app.seed import seed
from tests.conftest import FIXTURES


def count(session: Session, table: type[models.Base]) -> int:
    return session.scalar(select(func.count()).select_from(table)) or 0


def test_seed_is_idempotent_and_keeps_review_changes(sessions: sessionmaker[Session]) -> None:
    with sessions() as session:
        inst = session.get(models.Instance, ("test", 5))
        assert inst is not None
        inst.review_status = "confirmed"
        session.commit()

        assert seed(session, FIXTURES) is False  # already seeded by the fixture

        assert count(session, models.Instance) == 6
        assert count(session, models.Issue) == 5
        assert count(session, models.ScanClass) == 7
        again = session.get(models.Instance, ("test", 5))
        assert again is not None and again.review_status == "confirmed"


def test_seed_sets_current_class_and_issue_order(sessions: sessionmaker[Session]) -> None:
    with sessions() as session:
        inst = session.get(models.Instance, ("test", 1))
        assert inst is not None
        assert (inst.class_id, inst.current_class_id, inst.review_status) == (
            20,
            20,
            "unreviewed",
        )
        orders = session.scalars(select(models.Issue.sort_order).order_by(models.Issue.sort_order))
        assert list(orders) == [0, 1, 2, 3, 4]


def test_migration_matches_the_models(engine: Engine) -> None:
    """Alembic finds no difference between the migrated database and models.py."""
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)

    assert diff == []
