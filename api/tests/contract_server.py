"""
API server for the frontend's contract tests (web/src/data/contract/, ADR 0010)
------------------------------------------------------------------------------
Starts a throwaway PostgreSQL 16 container (testcontainers, as in conftest.py), runs the
real migration, seeds tests/fixtures/ and serves the real app on 127.0.0.1 at a free
port. Test-only extra: `POST /__test__/reset` empties the tables and seeds again, so
every contract test starts from the same data.

Prints `READY <base url>` once requests are answered. Stops on SIGTERM or Ctrl+C and
removes the container.

Usage (the web contract tests start it themselves):
    uv run --project api python -m tests.contract_server
"""

import os
import signal
import socket
import sys
import threading
import time
import urllib.request
from collections.abc import Iterator
from pathlib import Path
from types import FrameType

import uvicorn
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from testcontainers.community.postgres import PostgresContainer

from app.db import get_session
from app.main import create_app
from app.seed import seed

os.environ.setdefault("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE", "/var/run/docker.sock")

API_DIR = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).parent / "fixtures"
TABLES = "review_event, issue, instance, scan_class, scan"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port: int = s.getsockname()[1]
        return port


def main() -> None:
    with PostgresContainer("postgres:16-alpine", driver="psycopg") as pg:
        url = pg.get_connection_url()
        config = Config(str(API_DIR / "alembic.ini"))
        config.set_main_option("script_location", str(API_DIR / "migrations"))
        config.attributes["database_url"] = url
        command.upgrade(config, "head")
        engine = create_engine(url)
        sessions = sessionmaker(engine, expire_on_commit=False)

        def reset() -> None:
            with engine.begin() as conn:
                conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
            with sessions() as session:
                seed(session, FIXTURES)

        def test_session() -> Iterator[Session]:
            with sessions() as session:
                yield session

        reset()
        app = create_app()
        app.dependency_overrides[get_session] = test_session
        app.add_api_route("/__test__/reset", reset, methods=["POST"], status_code=204)

        port = free_port()
        server = uvicorn.Server(
            uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
        )

        def stop(_signum: int, _frame: FrameType | None) -> None:
            server.should_exit = True

        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)

        thread = threading.Thread(target=server.run)
        thread.start()
        base = f"http://127.0.0.1:{port}"
        for _ in range(100):
            try:
                urllib.request.urlopen(f"{base}/api/health", timeout=1).close()
                break
            except OSError:
                time.sleep(0.1)
        print(f"READY {base}/api", flush=True)
        while thread.is_alive():
            thread.join(timeout=0.5)
        engine.dispose()
    sys.exit(0)


if __name__ == "__main__":
    main()
