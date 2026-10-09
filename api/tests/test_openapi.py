from pathlib import Path

from app.openapi import openapi_json

WEB_SCHEMA = Path(__file__).resolve().parents[2] / "web" / "src" / "data" / "openapi.json"


def test_frontend_schema_matches_the_api() -> None:
    """The frontend's types are generated from web/src/data/openapi.json. If this fails,
    the API changed: run `make types` and commit both files."""
    assert WEB_SCHEMA.read_text() == openapi_json()
