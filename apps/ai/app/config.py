"""Settings, validated at startup.

A missing required variable stops the process rather than failing at first
use. See docs/architecture.md#configuration.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Service to service. This process never holds a user JWT (D4).
    ai_service_api_key: str = "dev-insecure-change-me"
    api_internal_url: str = "http://api:3002"

    # Models. The extraction ladder escalates only on evidence (D36).
    anthropic_api_key: str = ""
    ai_chat_model: str = "claude-sonnet-5-5"
    ai_vision_primary: str = "claude-haiku-5-5"
    ai_vision_secondary: str = "claude-sonnet-5-5"
    ai_vision_tertiary: str = "claude-opus-5"
    ai_quality_threshold: int = 70
    ai_extraction_budget_ms: int = 45_000
    ai_max_steps: int = 8

    port: int = 3004


settings = Settings()
