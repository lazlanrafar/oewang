"""The real model, through whatever `AI_BASE_URL` points at.

Opt in with `RUN_LIVE_MODEL_TESTS=1`: these cost money and need the
gateway up, so they are not part of an ordinary run. They exist because
the two things the rest of M4 is built on, a streamed answer and a tool
call in the Anthropic shape, are exactly what a gateway in front of a
non-Claude model might not deliver (D67).
"""

from __future__ import annotations

import json
import os

import pytest

from app.config import settings
from app.core import model

# `conftest`'s autouse fixture resets the client around every test, so
# these build the configured one rather than a fake.
pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_MODEL_TESTS") != "1",
    reason="set RUN_LIVE_MODEL_TESTS=1 to call the real model",
)

TOOLS = [
    {
        "name": "get_spending_summary",
        "description": "Totals per category for a date range.",
        "input_schema": {
            "type": "object",
            "properties": {"from": {"type": "string"}, "to": {"type": "string"}},
            "required": ["from", "to"],
        },
    }
]


async def test_a_whole_answer_comes_back() -> None:
    """Shape, not wording. A gateway routes to whatever model it likes and
    may carry its own system prompt, so what the answer says is not
    something a test can pin down."""
    answer = await model.complete(
        model=settings.ai_chat_model,
        max_tokens=32,
        messages=[{"role": "user", "content": "Reply with the single word: ready"}],
    )

    assert answer.stop_reason is not None
    text = "".join(block.text for block in answer.content if block.type == "text")
    assert text.strip() != ""


async def test_text_arrives_as_deltas() -> None:
    chunks: list[str] = []
    async with model.model_client().messages.stream(
        model=settings.ai_chat_model,
        max_tokens=64,
        messages=[{"role": "user", "content": "Name three fruits, one per line."}],
    ) as stream:
        async for text in stream.text_stream:
            chunks.append(text)

    # One chunk still proves the event stream was parsed; a short answer
    # legitimately arrives whole.
    assert chunks, "no text_delta events reached the client"
    assert "".join(chunks).strip() != ""


async def test_a_tool_call_comes_back_in_the_anthropic_shape() -> None:
    """The whole tool loop depends on this surviving the gateway's
    translation to whatever model actually answers."""
    answer = await model.complete(
        model=settings.ai_chat_model,
        max_tokens=256,
        tools=TOOLS,
        messages=[
            {
                "role": "user",
                "content": "How much did I spend between 2026-10-01 and 2026-10-31? Use the tool.",
            }
        ],
    )

    assert answer.stop_reason == "tool_use"
    call = next(block for block in answer.content if block.type == "tool_use")
    assert call.name == "get_spending_summary"
    assert json.loads(json.dumps(call.input))["from"] == "2026-10-01"
