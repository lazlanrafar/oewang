"""chat_begin_core / chat_end_core — the in-process port of AiService.chatBegin
/chatEnd (ai.service.ts). Covers session create/load, the early-vs-ready
contract, quota enforcement, and the atomic-increment reuse (chat_end_core must
call quota.increment_ai_tokens, never reimplement the SQL itself).
"""

import app.modules.chatbot.chat_money_path as cmp_mod
from app.core.quota import PlanLimitReached


def _patch_common(monkeypatch, *, existing_session=None, latest_draft=None, receipt_preview=None):
    async def fake_get_or_create(_ws):
        return {"custom_instructions": None, "response_language": "auto"}

    async def fake_create_session(_ws, title):
        return {"id": "new-session", "title": title}

    async def fake_get_session(_sid, _ws):
        return existing_session

    async def fake_save_message(*a, **k):
        return {"id": "msg1"}

    async def fake_get_session_messages(_sid, _ws):
        return [{"role": "user", "content": "hi", "attachments": None}]

    async def fake_audit_log(**k):
        return None

    async def fake_get_latest_draft_state(_history):
        return latest_draft

    async def fake_handle_pending(*a, **k):
        return {"sessionId": "s1", "reply": "draft handled"} if latest_draft else None

    async def fake_has_receipt_attachments(_a):
        return bool(receipt_preview)

    async def fake_build_draft(*a, **k):
        return receipt_preview

    async def fake_notify(*a, **k):
        return None

    monkeypatch.setattr(cmp_mod, "agent_settings_mod", type("M", (), {"get_or_create": staticmethod(fake_get_or_create)}))
    monkeypatch.setattr(cmp_mod.sessions, "create_session", fake_create_session)
    monkeypatch.setattr(cmp_mod.sessions, "get_session", fake_get_session)
    monkeypatch.setattr(cmp_mod.sessions, "save_message", fake_save_message)
    monkeypatch.setattr(cmp_mod.sessions, "get_session_messages", fake_get_session_messages)
    monkeypatch.setattr(cmp_mod.audit, "log", fake_audit_log)
    monkeypatch.setattr(cmp_mod.draft, "get_latest_draft_state", lambda h: latest_draft)
    monkeypatch.setattr(cmp_mod.draft, "handle_pending_invoice_draft", fake_handle_pending)
    monkeypatch.setattr(cmp_mod.draft, "has_receipt_attachments", lambda a: bool(receipt_preview))
    monkeypatch.setattr(cmp_mod.draft, "build_invoice_draft_from_attachments", fake_build_draft)
    monkeypatch.setattr(cmp_mod, "_notify_usage", fake_notify)
    monkeypatch.setattr(cmp_mod, "_workspace_currency", _async_return(("IDR", "Rp")))
    # Never spawn the real (network-hitting) title-upgrade task in tests.
    monkeypatch.setattr(cmp_mod, "_upgrade_title", _async_return(None))


def _async_return(value):
    async def f(*a, **k):
        return value

    return f


async def test_chat_begin_core_creates_new_session_and_returns_ready(monkeypatch):
    _patch_common(monkeypatch)

    async def fake_check_quota(_ws):
        return 42

    monkeypatch.setattr(cmp_mod.quota, "check_quota", fake_check_quota)

    result = await cmp_mod.chat_begin_core("ws1", "u1", [{"role": "user", "content": "hi"}])
    assert result["kind"] == "ready"
    assert result["sessionId"] == "new-session"
    assert result["currentTokens"] == 42
    assert "Oewang" in result["systemPrompt"]


async def test_chat_begin_core_loads_existing_session(monkeypatch):
    _patch_common(monkeypatch, existing_session={"id": "s1", "workspace_id": "ws1"})

    async def fake_check_quota(_ws):
        return 0

    monkeypatch.setattr(cmp_mod.quota, "check_quota", fake_check_quota)

    result = await cmp_mod.chat_begin_core("ws1", "u1", [{"role": "user", "content": "hi"}], session_id="s1")
    assert result["kind"] == "ready"
    assert result["sessionId"] == "s1"


async def test_chat_begin_core_raises_when_session_not_found(monkeypatch):
    _patch_common(monkeypatch, existing_session=None)

    try:
        await cmp_mod.chat_begin_core("ws1", "u1", [{"role": "user", "content": "hi"}], session_id="missing")
        raised = False
    except cmp_mod.SessionNotFoundError:
        raised = True
    assert raised


async def test_chat_begin_core_pending_draft_short_circuits_before_quota(monkeypatch):
    _patch_common(
        monkeypatch,
        existing_session={"id": "s1", "workspace_id": "ws1"},
        latest_draft={"status": "awaiting_confirmation"},
    )

    async def fail_check_quota(_ws):
        raise AssertionError("quota check must not run on an early-reply turn")

    monkeypatch.setattr(cmp_mod.quota, "check_quota", fail_check_quota)

    result = await cmp_mod.chat_begin_core("ws1", "u1", [{"role": "user", "content": "confirm"}], session_id="s1")
    assert result == {"kind": "early", "sessionId": "s1", "reply": "draft handled"}


async def test_chat_begin_core_new_receipt_short_circuits_before_quota(monkeypatch):
    _patch_common(
        monkeypatch,
        receipt_preview={"reply": "please confirm", "draft": {"status": "awaiting_confirmation"}},
    )

    async def fail_check_quota(_ws):
        raise AssertionError("quota check must not run on an early-reply turn")

    monkeypatch.setattr(cmp_mod.quota, "check_quota", fail_check_quota)

    result = await cmp_mod.chat_begin_core(
        "ws1", "u1", [{"role": "user", "content": "here's a receipt", "attachments": [{"type": "image/png"}]}]
    )
    assert result["kind"] == "early"
    assert result["reply"] == "please confirm"


async def test_chat_begin_core_quota_exceeded_raises_plan_limit_reached(monkeypatch):
    _patch_common(monkeypatch)

    async def fake_check_quota(_ws):
        raise PlanLimitReached("2026-02-01T00:00:00+00:00")

    monkeypatch.setattr(cmp_mod.quota, "check_quota", fake_check_quota)

    try:
        await cmp_mod.chat_begin_core("ws1", "u1", [{"role": "user", "content": "hi"}])
        raised = False
    except PlanLimitReached:
        raised = True
    assert raised


async def test_chat_end_core_persists_reply_and_increments_atomically(monkeypatch):
    saved = {}
    incremented = {}
    notified = {}

    async def fake_save_message(session_id, workspace_id, role, content, attachments=None):
        saved.update(session_id=session_id, workspace_id=workspace_id, role=role, content=content, attachments=attachments)

    async def fake_increment(workspace_id, tokens_spent):
        incremented.update(workspace_id=workspace_id, tokens_spent=tokens_spent)

    async def fake_notify(workspace_id, event_type):
        notified.update(workspace_id=workspace_id, event_type=event_type)

    monkeypatch.setattr(cmp_mod.sessions, "save_message", fake_save_message)
    monkeypatch.setattr(cmp_mod.quota, "increment_ai_tokens", fake_increment)
    monkeypatch.setattr(cmp_mod, "_notify_usage", fake_notify)

    await cmp_mod.chat_end_core(
        "ws1", "s1", "the reply", usage={"input_tokens": 30, "output_tokens": 70},
        artifacts=[{"type": "spending-canvas"}], provider={"name": "openai"},
    )

    assert saved["role"] == "assistant"
    assert saved["content"] == "the reply"
    assert saved["attachments"]["artifacts"] == [{"type": "spending-canvas"}]
    assert saved["attachments"]["provider"] == {"name": "openai"}
    # Must go through quota.increment_ai_tokens (the atomic UPDATE), never
    # reimplement the sum itself.
    assert incremented == {"workspace_id": "ws1", "tokens_spent": 100}
    assert notified == {"workspace_id": "ws1", "event_type": "workspace.usage"}


async def test_chat_end_core_skips_increment_and_notify_when_no_tokens_spent(monkeypatch):
    calls = {"increment": False, "notify": False}

    async def fake_save_message(*a, **k):
        return None

    async def fake_increment(*a, **k):
        calls["increment"] = True

    async def fake_notify(*a, **k):
        calls["notify"] = True

    monkeypatch.setattr(cmp_mod.sessions, "save_message", fake_save_message)
    monkeypatch.setattr(cmp_mod.quota, "increment_ai_tokens", fake_increment)
    monkeypatch.setattr(cmp_mod, "_notify_usage", fake_notify)

    await cmp_mod.chat_end_core("ws1", "s1", "reply with no tool usage")
    assert calls == {"increment": False, "notify": False}
