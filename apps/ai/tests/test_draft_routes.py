"""Telegram-facing draft-flow routes — x-api-key only (no JWT), mirroring
/tools/execute and /chat/run's trust model.
"""

import app.api.routes.draft as draft_routes
from app.api.middleware.auth import require_api_key
from app.config import get_settings
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def _auth_bypass():
    app.dependency_overrides[require_api_key] = lambda: None


def test_draft_routes_require_api_key(monkeypatch):
    monkeypatch.setattr(get_settings(), "AI_SERVICE_API_KEY", "test_key")
    r = client.post("/draft/latest-state", json={"history": []})
    assert r.status_code == 401


def test_latest_state_wraps_get_latest_draft_state(monkeypatch):
    _auth_bypass()
    try:
        monkeypatch.setattr(
            draft_routes.draft,
            "get_latest_draft_state",
            lambda h: {"status": "awaiting_confirmation"},
        )
        r = client.post(
            "/draft/latest-state",
            json={"history": [{"role": "assistant", "content": "x"}]},
        )
        assert r.status_code == 200
        assert r.json() == {"draft": {"status": "awaiting_confirmation"}}
    finally:
        app.dependency_overrides.clear()


def test_latest_state_returns_null_when_no_draft(monkeypatch):
    _auth_bypass()
    try:
        monkeypatch.setattr(
            draft_routes.draft, "get_latest_draft_state", lambda h: None
        )
        r = client.post("/draft/latest-state", json={"history": []})
        assert r.json() == {"draft": None}
    finally:
        app.dependency_overrides.clear()


async def test_handle_pending_wraps_and_passes_body_through(monkeypatch):
    _auth_bypass()
    try:
        captured = {}

        async def fake_handle(workspace_id, user_id, messages, session_id, **kwargs):
            captured.update(
                workspace_id=workspace_id,
                user_id=user_id,
                message=messages[0],
                session_id=session_id,
            )
            return {"kind": "early", "sessionId": session_id, "reply": "ok"}

        monkeypatch.setattr(draft_routes, "chat_begin_core", fake_handle)
        r = client.post(
            "/draft/handle-pending",
            json={
                "workspace_id": "ws1",
                "user_id": "u1",
                "message": {"role": "user", "content": "confirm"},
                "draft": {"status": "awaiting_confirmation"},
                "session_id": "s1",
            },
        )
        assert r.status_code == 200
        assert r.json()["result"]["session_id"] == "s1"
        assert r.json()["result"]["sessionId"] == "s1"
        assert r.json()["result"]["reply"] == "ok"
        assert captured["workspace_id"] == "ws1"
        assert captured["message"] == {"role": "user", "content": "confirm"}
    finally:
        app.dependency_overrides.clear()


async def test_build_from_attachments_wraps_and_returns_null(monkeypatch):
    _auth_bypass()
    try:

        async def fake_build(*args, **kwargs):
            return {"kind": "ready"}

        monkeypatch.setattr(draft_routes, "chat_begin_core", fake_build)
        r = client.post(
            "/draft/build-from-attachments",
            json={
                "workspace_id": "ws1",
                "user_id": "u1",
                "attachments": [{"name": "r.png", "type": "image/png", "data": "abc"}],
            },
        )
        assert r.status_code == 200
        assert r.json() == {"result": None}
    finally:
        app.dependency_overrides.clear()


def test_should_forward_caption_and_verified_context_when_photo_uploaded(monkeypatch):
    _auth_bypass()
    captured = {}

    async def begin(ws, user, messages, sid, **kwargs):
        captured.update(ws=ws, user=user, messages=messages, sid=sid, **kwargs)
        return {"kind": "early", "sessionId": "private", "reply": "Rincian struk"}

    monkeypatch.setattr(draft_routes, "chat_begin_core", begin)
    try:
        response = client.post(
            "/draft/build-from-attachments",
            json={
                "workspace_id": "w",
                "user_id": "u",
                "session_id": "s",
                "caption": "Tolong baca struk",
                "personal_memory": True,
                "attachments": [],
            },
        )
        assert response.json()["result"]["session_id"] == "private"
        assert captured["messages"][0]["content"] == "Tolong baca struk"
        assert captured["personal_memory"] is True
    finally:
        app.dependency_overrides.clear()


def test_should_deny_guessed_session_when_draft_endpoint_called(monkeypatch):
    _auth_bypass()

    async def begin(*args, **kwargs):
        raise draft_routes.SessionNotFoundError("Access denied")

    monkeypatch.setattr(draft_routes, "chat_begin_core", begin)
    try:
        response = client.post(
            "/draft/handle-pending",
            json={
                "workspace_id": "w",
                "user_id": "other",
                "session_id": "private",
                "message": {"role": "user", "content": "simpan"},
                "draft": {"entries": [{"amount": 10}]},
            },
        )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()
