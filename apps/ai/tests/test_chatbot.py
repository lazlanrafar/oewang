from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api.middleware.auth import require_api_key
from app.config import Settings
from app.main import app

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
