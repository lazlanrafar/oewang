"""Legacy chat uses the same owner-scoped orchestration as the other channels."""

import pytest
from app.modules.chatbot import service


async def test_should_use_shared_orchestration_when_legacy_chat_called(monkeypatch):
    async def stream(ws, user, message, session):
        assert (ws, user, message, session) == ("w", "u", "hello", "s")
        yield {"event": "content", "data": {"text": "hello"}}
        yield {"event": "done", "data": {"session_id": "s"}}

    monkeypatch.setattr(service, "stream_service_chat", stream)
    assert await service.chat("hello", "w", "u", "s") == {
        "reply": "hello",
        "session_id": "s",
    }


async def test_should_reject_missing_identity_when_legacy_chat_called():
    with pytest.raises(ValueError, match="identity"):
        await service.chat("hi", "w", None, "private-session")
