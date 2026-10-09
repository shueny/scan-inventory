"""Test database: a throwaway PostgreSQL 16 container (testcontainers, ADR 0008).

The container starts once per test run, gets the real Alembic migration, and every test
starts from the same small synthetic data set in tests/fixtures/.
"""

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from testcontainers.community.postgres import PostgresContainer

from app.db import get_session
from app.main import create_app
from app.seed import seed

# testcontainers mounts the Docker socket into its clean-up container. With Docker Desktop
# the host socket lives in the user's home, which cannot be mounted; the socket inside
# Docker's own VM (and on Linux) is /var/run/docker.sock.
os.environ.setdefault("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE", "/var/run/docker.sock")

API_DIR = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).parent / "fixtures"
TABLES = "review_event, issue, instance, scan_class, scan"


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    with PostgresContainer("postgres:16-alpine", driver="psycopg") as pg:
        url = pg.get_connection_url()
        config = Config(str(API_DIR / "alembic.ini"))
        config.set_main_option("script_location", str(API_DIR / "migrations"))
        config.attributes["database_url"] = url
        command.upgrade(config, "head")
        engine = create_engine(url)
        yield engine
        engine.dispose()


@pytest.fixture
def sessions(engine: Engine) -> sessionmaker[Session]:
    """Fresh data for every test: empty all tables, then seed the fixtures."""
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as session:
        seed(session, FIXTURES)
    return factory


@pytest.fixture
def client(sessions: sessionmaker[Session]) -> Iterator[TestClient]:
    app = create_app()

    def test_session() -> Iterator[Session]:
        with sessions() as session:
            yield session

    app.dependency_overrides[get_session] = test_session
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
