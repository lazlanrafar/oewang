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
        if not settings.ai_api_key:
            raise ModelUnavailable("AI_API_KEY is not set")
        _client = AsyncAnthropic(
            api_key=settings.ai_api_key,
            # A gateway speaking the Anthropic protocol, or the default
            # endpoint when unset (D67). One SDK either way, so the tool
            # loop and the extraction ladder never learn which it is.
            **({"base_url": settings.ai_base_url} if settings.ai_base_url else {}),
            # Per-call ceiling from the extraction ladder; a pass that hangs
            # counts as a failed pass rather than stalling the whole ladder
            # (docs/ai/service.md#budget-and-caps).
            timeout=settings.model_timeout_secs,
            max_retries=settings.model_max_retries,
        )
    return _client


async def complete(**kwargs: Any) -> Any:
    """One finished answer, assembled from the streaming API.

    Never `messages.create`. A gateway may answer every request as an
    event stream whatever the request asked for, and 9Router does (D67),
    so the non-streaming call returns a body the SDK cannot parse.
    Streaming and accumulating works against both, which is one path
    rather than a branch on who is answering.

    Used by everything that wants a whole message: the extraction ladder,
    column mapping and session titles. The chat loop streams directly,
    because it forwards the tokens as they arrive.
    """
    async with model_client().messages.stream(**kwargs) as stream:
        return await stream.get_final_message()


def tokens_of(message: Any) -> tuple[int, int]:
    """Input and output tokens a finished message reports, zero when the
    provider says nothing. A gateway may omit the field; a missing count is
    not a reason to fail the call it describes."""
    usage = getattr(message, "usage", None)
    return (
        int(getattr(usage, "input_tokens", 0) or 0),
        int(getattr(usage, "output_tokens", 0) or 0),
    )


def usage_report(input_tokens: int, output_tokens: int, model_id: str | None) -> dict[str, Any]:
    """The `usage` field every route answers with (D92). The API writes it
    to the workspace's ledger; nothing here keeps it."""
    return {"input": input_tokens, "output": output_tokens, "model": model_id}


def set_model_client(client: Any | None) -> None:
    """Install a client, or reset to the configured one with `None`."""
    global _client
    _client = client
