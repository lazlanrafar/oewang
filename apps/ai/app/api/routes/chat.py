"""`POST /chat/stream`.

The turn the user is watching. Tokens leave as they arrive, each one a
sealed event, and the stream always ends on `done` or `error`
(docs/ai/service.md#streaming-protocol).

This story runs the turn **without tools**: no tool list reaches the model,
so there is no loop, no tool call and nothing to execute. The eleven tools
and the loop around them arrive in US-030. Everything else the turn needs
(wallets, categories, settings) comes in the request body, because this
service reads no database (D3, CHAT-7).

Nothing here logs prompt text, message content, a token or a key (OPS-3).
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.config import Settings
from app.core import model
from app.core.sse import MEDIA_TYPE, SSE_HEADERS, EventWriter
from app.modules.chat.prompt import build_system_prompt
from app.modules.chat.schemas import ChatStreamRequest

logger = logging.getLogger("oewang.ai.chat")

router = APIRouter()

#: A caller that cannot decrypt is a transport problem, handled before the
#: stream opens. Once it is open, a failure is an event, and its message is
#: fixed text: an exception string can carry anything, including the prompt.
MODEL_FAILED_MESSAGE = "the model call failed"


def _usage(message: Any) -> dict[str, int]:
    """Token counts from the finished message, or zeros.

    A turn that was cut short still reports what it knows: the API persists
    the partial reply either way (CHAT-9).
    """
    usage = getattr(message, "usage", None)
    return {
        "input": int(getattr(usage, "input_tokens", 0) or 0),
        "output": int(getattr(usage, "output_tokens", 0) or 0),
    }


async def _events(writer: EventWriter, kwargs: dict[str, Any], label: str) -> AsyncIterator[bytes]:
    started = time.perf_counter()
    usage = {"input": 0, "output": 0}

    try:
        async with model.model_client().messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                if text:
                    yield writer.event("token", {"text": text})
            usage = _usage(await stream.get_final_message())
    except asyncio.CancelledError:
        # The caller hung up, so there is nobody left to send `done` to.
        # Ending here is clean because an event is written whole or not at
        # all: whatever the API already read is a consistent prefix of the
        # reply, which is what it persists (CHAT-9).
        logger.info("%s aborted after %d events", label, writer.seq)
        raise
    except model.ModelUnavailable:
        yield writer.event(
            "error", {"code": "MODEL_UNAVAILABLE", "message": "no model is configured"}
        )
        return
    except Exception as exc:
        # The exception type, never its message: a provider error can quote
        # the request back (OPS-3).
        logger.error("%s failed with %s", label, type(exc).__name__)
        yield writer.event("error", {"code": "MODEL_FAILED", "message": MODEL_FAILED_MESSAGE})
        return

    # `message_id` belongs to the persisted row, which this service does not
    # own. The API fills it in when it re-seals the event for the next hop.
    yield writer.event("done", {"message_id": None, "usage": usage})

    logger.info(
        "%s finished in %dms, %d events, %d input and %d output tokens",
        label,
        int((time.perf_counter() - started) * 1000),
        writer.seq,
        usage["input"],
        usage["output"],
    )


@router.post("/chat/stream")
async def chat_stream(body: ChatStreamRequest, request: Request) -> StreamingResponse:
    config: Settings = request.app.state.config

    messages = body.bounded_history()
    messages.append({"role": "user", "content": body.message})

    kwargs: dict[str, Any] = {
        "model": config.ai_chat_model,
        "max_tokens": config.ai_max_output_tokens,
        "system": build_system_prompt(
            role=body.role, context=body.context, settings=body.settings
        ),
        "messages": messages,
    }
    # No `tools` key, and not an empty list either: this turn has no tools at
    # all. Attachments are validated above and deliberately not forwarded.
    # A receipt is text somebody else wrote, and the component that reads it
    # is the one with no tools, never this one (D24, SEC-21). The capture
    # path is POST /receipt/parse.

    return StreamingResponse(
        _events(
            # The OWE1 layer leaves an event stream alone, so the keys it put
            # on the scope are how each event gets sealed. Absent means
            # encryption is off, which only development allows.
            EventWriter(request.scope.get("owe1")),
            kwargs,
            f"chat turn for workspace {body.workspace_id} session {body.session_id}",
        ),
        media_type=MEDIA_TYPE,
        headers=SSE_HEADERS,
    )
