"""Write the API's OpenAPI schema as JSON, for the frontend's generated types (PRD 6).

Runs without a database: the schema comes from the route and Pydantic definitions only.

Usage (from the repo root):
    uv run --project api python -m app.openapi > web/src/data/openapi.json
"""

import json
from typing import Any

from app.main import create_app


def openapi_json() -> str:
    schema: dict[str, Any] = create_app().openapi()
    return json.dumps(schema, indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    print(openapi_json(), end="")
