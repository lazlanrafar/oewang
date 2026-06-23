from unittest.mock import patch

from fastapi.testclient import TestClient

import app.modules.chatbot.service as cbsvc
from app.api.middleware.auth import require_api_key
from app.config import Settings
from app.main import app
from app.schemas.chatbot import WebChatMessage

client = TestClient(app)


def test_health_ok():
    assert client.get("/health").json() == {"status": "ok"}


def test_chat_rejects_blank_message():
    app.dependency_overrides[require_api_key] = lambda: None
    try:
        r = client.post("/chat", json={"message": "   ", "workspace_id": "w1"})
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_chat_requires_valid_api_key():
    # Auth runs before the handler, so no DB/LLM is touched on a bad key.
    with patch(
        "app.api.middleware.auth.get_settings",
        return_value=Settings(AI_SERVICE_API_KEY="secret"),
    ):
        r = client.post(
            "/chat",
            json={"message": "hai", "workspace_id": "w1"},
            headers={"x-api-key": "wrong"},
        )
    assert r.status_code == 401


async def test_web_chat_returns_full_contract(monkeypatch):
    async def fake_balance(ws):
        return 1000.0

    async def fake_txns(ws, limit=10):
        return []

    async def fake_currency(ws):
        return None

    monkeypatch.setattr(cbsvc, "_balance", fake_balance)
    monkeypatch.setattr(cbsvc, "_recent_transactions", fake_txns)
    monkeypatch.setattr(cbsvc, "get_currency_settings", fake_currency)
    monkeypatch.setattr(
        cbsvc.llm,
        "complete_raw",
        lambda *a, **k: {
            "reply": "Hello",
            "usage": {"input_tokens": 10, "output_tokens": 5},
            "response_id": "resp_1",
        },
    )

    res = await cbsvc.web_chat(
        [WebChatMessage(role="user", content="hi")], "w1", "u1", "s1", False
    )
    assert res["reply"] == "Hello"
    assert res["session_id"] == "s1"
    assert res["usage"]["output_tokens"] == 5
    assert res["provider"]["name"] == "openai"
    assert res["artifact"] is None
