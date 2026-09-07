"""Telegram-facing draft-flow routes — x-api-key only (no JWT), mirroring
/tools/execute and /chat/run's trust model.
"""

from fastapi.testclient import TestClient

import app.api.routes.draft as draft_routes
from app.api.middleware.auth import require_api_key
from app.main import app

client = TestClient(app)


def _auth_bypass():
    app.dependency_overrides[require_api_key] = lambda: None


def test_draft_routes_require_api_key():
    r = client.post("/draft/latest-state", json={"history": []})
    assert r.status_code == 401


def test_latest_state_wraps_get_latest_draft_state(monkeypatch):
    _auth_bypass()
    try:
        monkeypatch.setattr(
            draft_routes.draft, "get_latest_draft_state", lambda h: {"status": "awaiting_confirmation"}
        )
        r = client.post("/draft/latest-state", json={"history": [{"role": "assistant", "content": "x"}]})
        assert r.status_code == 200
        assert r.json() == {"draft": {"status": "awaiting_confirmation"}}
    finally:
        app.dependency_overrides.clear()


def test_latest_state_returns_null_when_no_draft(monkeypatch):
    _auth_bypass()
    try:
        monkeypatch.setattr(draft_routes.draft, "get_latest_draft_state", lambda h: None)
        r = client.post("/draft/latest-state", json={"history": []})
        assert r.json() == {"draft": None}
    finally:
        app.dependency_overrides.clear()


async def test_handle_pending_wraps_and_passes_body_through(monkeypatch):
    _auth_bypass()
    try:
        captured = {}

        async def fake_handle(workspace_id, user_id, message, draft, session_id):
            captured.update(
                workspace_id=workspace_id, user_id=user_id, message=message, draft=draft, session_id=session_id
            )
            return {"sessionId": session_id, "reply": "ok"}

        monkeypatch.setattr(draft_routes.draft, "handle_pending_invoice_draft", fake_handle)
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
        assert r.json() == {"result": {"sessionId": "s1", "reply": "ok"}}
        assert captured["workspace_id"] == "ws1"
        assert captured["message"] == {"role": "user", "content": "confirm"}
    finally:
        app.dependency_overrides.clear()


async def test_build_from_attachments_wraps_and_returns_null(monkeypatch):
    _auth_bypass()
    try:
        async def fake_build(workspace_id, user_id, attachments):
            return None

        monkeypatch.setattr(draft_routes.draft, "build_invoice_draft_from_attachments", fake_build)
        r = client.post(
            "/draft/build-from-attachments",
            json={"workspace_id": "ws1", "user_id": "u1", "attachments": [{"name": "r.png", "type": "image/png", "data": "abc"}]},
        )
        assert r.status_code == 200
        assert r.json() == {"result": None}
    finally:
        app.dependency_overrides.clear()
