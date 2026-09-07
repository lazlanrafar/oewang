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
    # Model provider endpoint (9router or OpenAI-compatible proxy)
    MODEL_BASE_URL: str = "http://localhost:20128/v1"
    MODEL_API_KEY: str = "9router"
    AI_CHAT_MODEL: str = "coder"
    AI_VISION_MODEL: str = "coder"
    AI_RECEIPT_DETAIL: str = "auto"  # low | auto | high
    AI_EMBED_MODEL: str = "coder"
    AI_SERVICE_API_KEY: str = ""
    AI_PORT: int = 3004
    # Elysia base URL — this service's one remaining outbound call to apps/api:
    # the fire-and-forget /ai/internal/notify-usage ping after chat_end (Python
    # can't reach RealtimeService directly, it's an in-process EventEmitter).
    # The chat money path itself (chat_begin/chat_end) runs in-process here now.
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

    # Verifies the oewang-session JWT for /chat/web[/stream] (HS256). MUST be
    # byte-identical to apps/api's/apps/app's/apps/admin's JWT_SECRET.
    JWT_SECRET: str = ""

    # System-bucket-only R2/S3-compatible storage for the receipt-image vault
    # upload side effect (buildInvoiceDraftFromAttachments port). No per-workspace
    # custom bucket support — a workspace with custom R2 credentials configured in
    # apps/app will have AI-uploaded receipts land here instead. Mirrors apps/api's
    # Env.BUCKET_* naming.
    BUCKET_ENDPOINT: str = ""
    BUCKET_ACCESS_KEY_ID: str = ""
    BUCKET_SECRET_ACCESS_KEY: str = ""
    BUCKET_NAME: str = ""
    BUCKET_REGION: str = "auto"

    # Workspace ids exempt from AI token quota enforcement. Replaces a TS
    # hardcoded workspace id (ai.service.ts) with a config value.
    AI_QUOTA_EXEMPT_WORKSPACE_IDS: list[str] = []


@lru_cache
def get_settings() -> Settings:
    return Settings()
