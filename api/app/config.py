from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Read from environment variables (and .env), e.g. DATABASE_URL."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://scan:scan@localhost:5432/scan_inventory"
    # Folder with scan.json, instances.json, issues.json written by the pipeline.
    data_dir: Path = Path("../data")
    # Browser origins allowed to call the API (PRD 8.2: only the local web app).
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
