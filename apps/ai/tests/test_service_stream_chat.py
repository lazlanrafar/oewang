"""Every streaming channel passes through the owner-scoped money path."""

from unittest.mock import AsyncMock

import pytest
from app.modules.chatbot import chat_money_path, service


async def test_should_forward_events_when_legacy_stream_called(monkeypatch):
    expected = [
        {"event": "content", "data": {"text": "hai"}},
        {"event": "done", "data": {"session_id": "s"}},
    ]

    async def stream(*args):
        for event in expected:
            yield event

    monkeypatch.setattr(service, "stream_service_chat", stream)
    assert [e async for e in service.stream_chat("hi", "w", "u", "s")] == expected


async def test_should_persist_usage_once_when_tool_stream_completes(monkeypatch):
    monkeypatch.setattr(
        chat_money_path,
        "chat_begin_core",
        AsyncMock(
            return_value={
                "kind": "ready",
                "sessionId": "s",
                "currentTokens": 0,
                "history": [],
                "systemPrompt": "test",
            }
        ),
    )
    end = AsyncMock()
    monkeypatch.setattr(service.tools, "chat_end", end)

    async def stream(*args, **kwargs):
        for text in ["a", "b", "c"]:
            yield {"event": "content", "data": {"text": text}}
        yield {
            "event": "done",
            "data": {"reply": "abc", "usage": {"input_tokens": 7, "output_tokens": 3}},
        }

    monkeypatch.setattr(service.llm, "complete_with_tools_stream", stream)
    events = [e async for e in service.stream_service_chat("w", "u", "hi", "s")]
    assert end.await_count == 1
    assert events[-1]["data"]["session_id"] == "s"
    assert events[-1]["data"]["usage"]["input_tokens"] == 7


async def test_should_reject_missing_identity_when_stream_called():
    with pytest.raises(ValueError, match="identity"):
        _ = [e async for e in service.stream_chat("hi", "w", None, "s")]
