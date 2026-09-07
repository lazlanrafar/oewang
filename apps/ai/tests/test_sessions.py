"""AI chat session + message persistence — port of AiRepository.{createSession,
getSession,saveMessage,getSessionMessages}. get_session_messages must cap and
reverse the same way the TS repository does (LIMIT + DESC, then reversed to
oldest-first) or history grows unbounded per session.
"""

import app.core.sessions as sessions_mod


async def test_get_session_messages_caps_and_reverses(monkeypatch):
    captured = {}

    async def fake_fetch(query, *args):
        captured["query"] = query
        captured["args"] = args
        # DB returns newest-first (as the DESC + LIMIT query would).
        return [
            {"id": "m3", "created_at": 3},
            {"id": "m2", "created_at": 2},
            {"id": "m1", "created_at": 1},
        ]

    monkeypatch.setattr(sessions_mod, "fetch", fake_fetch)
    rows = await sessions_mod.get_session_messages("s1", "w1", limit=2)

    assert "ORDER BY created_at DESC" in captured["query"]
    assert "LIMIT $3" in captured["query"]
    assert captured["args"] == ("s1", "w1", 2)
    # Reversed back to oldest-first for the caller.
    assert [r["id"] for r in rows] == ["m3", "m2", "m1"][::-1]


async def test_get_session_messages_default_limit_is_20(monkeypatch):
    captured = {}

    async def fake_fetch(query, *args):
        captured["args"] = args
        return []

    monkeypatch.setattr(sessions_mod, "fetch", fake_fetch)
    await sessions_mod.get_session_messages("s1", "w1")
    assert captured["args"][-1] == 20


async def test_get_session_found(monkeypatch):
    async def fake_fetchrow(query, *args):
        assert args == ("s1", "w1")
        return {"id": "s1", "workspace_id": "w1", "title": "Chat"}

    monkeypatch.setattr(sessions_mod, "fetchrow", fake_fetchrow)
    result = await sessions_mod.get_session("s1", "w1")
    assert result == {"id": "s1", "workspace_id": "w1", "title": "Chat"}


async def test_get_session_not_found_returns_none(monkeypatch):
    async def fake_fetchrow(query, *args):
        return None

    monkeypatch.setattr(sessions_mod, "fetchrow", fake_fetchrow)
    assert await sessions_mod.get_session("missing", "w1") is None


async def test_update_title_calls_fetchrow_with_new_title(monkeypatch):
    captured = {}

    async def fake_fetchrow(query, *args):
        captured["query"] = query
        captured["args"] = args
        return None

    monkeypatch.setattr(sessions_mod, "fetchrow", fake_fetchrow)
    await sessions_mod.update_title("s1", "w1", "New Title")
    assert captured["args"] == ("s1", "w1", "New Title")
