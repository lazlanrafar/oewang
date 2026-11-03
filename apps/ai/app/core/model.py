"""The one place a model client is built.

Everything that talks to Claude goes through here, so a timeout, a retry
policy or a model id changes in one file. Tests install a fake with
`set_model_client`, which is why no module holds its own client.
"""

from __future__ import annotations

from typing import Any

from anthropic import AsyncAnthropic

from app.config import settings


class ModelUnavailable(Exception):
    """No API key is configured. Raised at first use rather than at startup,
    so the rest of the service still runs in a checkout without one."""


_client: Any | None = None


def model_client() -> Any:
    global _client
    if _client is None:
        if not settings.anthropic_api_key:
            raise ModelUnavailable("ANTHROPIC_API_KEY is not set")
        _client = AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            # Per-call ceiling from the extraction ladder; a pass that hangs
            # counts as a failed pass rather than stalling the whole ladder
            # (docs/ai/service.md#budget-and-caps).
            timeout=settings.model_timeout_secs,
            max_retries=settings.model_max_retries,
        )
    return _client


def set_model_client(client: Any | None) -> None:
    """Install a client, or reset to the configured one with `None`."""
    global _client
    _client = client
