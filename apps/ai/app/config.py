from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Single root .env locally (CLAUDE.md: no per-app env files). Walk up to find the
# nearest .env; None in containers/Railway (no file copied) — pydantic-settings then
# reads from the injected environment variables. (Avoids a hard parents[N] index that
# crashes when the tree is shallower than expected, e.g. /srv/app in Docker.)
_ROOT_ENV = next(
    (p / ".env" for p in Path(__file__).resolve().parents if (p / ".env").exists()),
    None,
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ROOT_ENV, extra="ignore")

    DATABASE_URL: str = ""
    OPENAI_API_KEY: str = ""  # used for both chat and embeddings
    AI_CHAT_MODEL: str = "gpt-4o-mini"
    AI_EMBED_MODEL: str = "text-embedding-3-small"
    AI_SERVICE_API_KEY: str = ""
    AI_PORT: int = 3004
    # Elysia base URL the sidecar calls back to for tool execution + the system
    # prompt (the money path stays in TS). Reuses AI_SERVICE_API_KEY as the
    # shared secret in both directions.
    API_INTERNAL_URL: str = "http://localhost:3002"
    AI_MAX_STEPS: int = 10
    ALERT_CALLBACK_URL: str = ""
    ANOMALY_SCAN_HOURS: int = 0  # 0 = periodic scan disabled (opt-in)
    # Money-path flags (mirror apps/api API_CONFIG). RECEIPT_DRY_RUN previews
    # transaction/item writes without persisting; MOCK_AI_QUOTA skips the limit
    # check. Dev defaults match the TS side.
    RECEIPT_DRY_RUN: bool = False
    # Enforce by default (fail closed): an unset flag in prod must not silently
    # disable quota. Set MOCK_AI_QUOTA=true locally to bypass the limit.
    MOCK_AI_QUOTA: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
