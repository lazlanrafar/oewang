"""Settings, validated at startup.

A missing required variable stops the process rather than failing at first
use. See docs/architecture.md#configuration.
"""

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

#: Handed to the API, never to this process. The shared .env carries them
#: for the API's sake, so the deployment drops them here and this check
#: refuses to start if one arrives anyway.
FORBIDDEN_VARIABLES = ("DATABASE_URL", "JWT_SECRET", "S3_SECRET_ACCESS_KEY", "RESEND_API_KEY")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Service to service. This process never holds a user JWT (D4).
    ai_service_api_key: str = "dev-insecure-change-me"
    api_internal_url: str = "http://api:3002"
    # One API call's ceiling, in seconds. A tool call is a database round
    # trip rather than a model call, so it is short: a turn that waits here
    # is a user watching a spinner between two model calls.
    api_timeout_secs: float = 30.0

    # The model provider (D67). Empty `ai_base_url` talks to Anthropic
    # directly; set it to a gateway and the same SDK talks to that instead,
    # which is how a model outside the Claude family reaches this service.
    ai_base_url: str = ""
    ai_api_key: str = ""

    # Models. The extraction ladder escalates only on evidence (D36).
    ai_chat_model: str = "claude-sonnet-5-5"
    ai_vision_primary: str = "claude-haiku-5-5"
    ai_vision_secondary: str = "claude-sonnet-5-5"
    ai_vision_tertiary: str = "claude-opus-5"
    ai_quality_threshold: int = 70
    ai_extraction_budget_ms: int = 45_000
    ai_max_steps: int = 8
    # One turn's ceiling on generated tokens. A bound on the answer is also
    # a bound on how long the user watches it arrive.
    ai_max_output_tokens: int = 2048
    # One model call's ceiling, in seconds, and how often the SDK retries a
    # transport failure before the call counts as a failed pass.
    model_timeout_secs: float = 20.0
    model_max_retries: int = 2

    # Payload encryption (D22). Plaintext mode is only honoured in
    # development; `validate` below refuses it anywhere else.
    owe1_enabled: bool = True
    app_env: str = "development"
    crypto_signing_key_file: Path = Path("./.secrets/ai-owe1-signing-key.pem")
    #: The API's Ed25519 signing keys, pinned by this service's client, as
    #: `kid:base64url` pairs separated by commas. The same variable the web
    #: app pins the API with: one signer, one published set, two clients.
    #: Empty is a development-only path, where the client reads what the
    #: local API publishes instead.
    crypto_signing_public_keys: str = ""

    # Requests per minute per caller. The handshake has its own, lower
    # ceiling (docs/api/encryption.md#handshake).
    rate_limit_per_minute: int = 600
    handshake_rate_limit_per_minute: int = 30

    port: int = 3004

    def validate_for_environment(self) -> None:
        """Stop at startup rather than at first use.

        Only the rules that cannot be expressed as a type live here; the
        rest are enforced by the field declarations above.
        """
        # D3 and D4 are deployment facts, so they are checked against the
        # environment rather than against this class: nothing here reads a
        # database or a storage key, and a process handed one is
        # misconfigured even if it never touches it.
        for name in FORBIDDEN_VARIABLES:
            if os.environ.get(name, "").strip():
                raise ValueError(
                    f"{name} must not be set on the AI service: it holds no database "
                    "connection, no storage credentials and no user token (D3, D4)"
                )

        if self.app_env != "development":
            if not self.owe1_enabled:
                raise ValueError("payload encryption can only be disabled in development")
            if len(self.ai_service_api_key) < 32:
                raise ValueError("AI_SERVICE_API_KEY must be at least 32 characters")
            if not self.ai_api_key:
                raise ValueError("AI_API_KEY is required outside development")
            if not self.crypto_signing_public_keys.strip():
                # A client that cannot verify a handshake stops, and reading
                # the key from the server it is meant to authenticate proves
                # nothing. So the pin is required before the first tool call
                # rather than discovered at it
                # (docs/api/encryption.md#server-signing-keys).
                raise ValueError(
                    "CRYPTO_SIGNING_PUBLIC_KEYS is required outside development: the "
                    "API's handshake signature is verified against a pinned key, never "
                    "against one the API itself hands over"
                )


settings = Settings()
