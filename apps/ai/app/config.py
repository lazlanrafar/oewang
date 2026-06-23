from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Single root .env (CLAUDE.md: no per-app env files). config.py is at apps/ai/app/.
_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ROOT_ENV, extra="ignore")

    DATABASE_URL: str = ""
    OPENAI_API_KEY: str = ""  # used for both chat and embeddings
    AI_CHAT_MODEL: str = "gpt-4o-mini"
    AI_EMBED_MODEL: str = "text-embedding-3-small"
    AI_SERVICE_API_KEY: str = ""
    AI_PORT: int = 3004
    ALERT_CALLBACK_URL: str = ""
    ANOMALY_SCAN_HOURS: int = 0  # 0 = periodic scan disabled (opt-in)


@lru_cache
def get_settings() -> Settings:
    return Settings()
