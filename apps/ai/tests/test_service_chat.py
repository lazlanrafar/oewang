"""chat()'s DB-fetch parallelization + output-token cap (Telegram latency fix,
plan Part 2 #2-#3). Route/quota-error behavior for /chat is already covered
by test_chatbot.py — this file is scoped to service.chat()'s own concurrency
and call-shape guarantees."""

import asyncio
import time

import app.modules.chatbot.service as cbsvc


async def test_chat_runs_db_fetches_concurrently(monkeypatch):
    # Sequential would take ~0.35s (sum of every delay below); gather() should
    # bring wall time close to the slowest single fetch (~0.2s history fetch).
    delays = {"balance": 0.05, "txns": 0.05, "currency": 0.05, "history": 0.2}

    async def fake_balance(workspace_id):
        await asyncio.sleep(delays["balance"])
        return 100.0

    async def fake_txns(workspace_id, limit=10):
        await asyncio.sleep(delays["txns"])
        return [{"amount": 1}]

    async def fake_currency(workspace_id):
        await asyncio.sleep(delays["currency"])
        return {"code": "IDR"}

    async def fake_history(session_id, workspace_id):
        await asyncio.sleep(delays["history"])
        return [{"role": "user", "content": "hi"}]

    captured = {}

    async def fake_complete_metered(system, messages, workspace_id, max_tokens=1024):
        captured["max_tokens"] = max_tokens
        return "the reply"

    monkeypatch.setattr(cbsvc, "_balance", fake_balance)
    monkeypatch.setattr(cbsvc, "_recent_transactions", fake_txns)
    monkeypatch.setattr(cbsvc, "get_currency_settings", fake_currency)
    monkeypatch.setattr(cbsvc, "load_history", fake_history)
    monkeypatch.setattr(cbsvc.llm, "complete_metered", fake_complete_metered)

    start = time.monotonic()
    result = await cbsvc.chat("hello", "ws1", "u1", "s1")
    elapsed = time.monotonic() - start

    assert elapsed < 0.3, f"expected concurrent fetches (~0.2s), took {elapsed:.3f}s"
    assert result == {"reply": "the reply", "session_id": "s1"}


def _install_context_fakes(monkeypatch, cbsvc, *, history_called: dict):
    async def fake_balance(workspace_id):
        return 0.0

    async def fake_txns(workspace_id, limit=10):
        return []

    async def fake_currency(workspace_id):
        return {}

    async def fake_history(session_id, workspace_id):
        history_called["called"] = True
        return []

    monkeypatch.setattr(cbsvc, "_balance", fake_balance)
    monkeypatch.setattr(cbsvc, "_recent_transactions", fake_txns)
    monkeypatch.setattr(cbsvc, "get_currency_settings", fake_currency)
    monkeypatch.setattr(cbsvc, "load_history", fake_history)


async def test_chat_skips_history_fetch_without_session_id(monkeypatch):
    history_called = {"called": False}
    _install_context_fakes(monkeypatch, cbsvc, history_called=history_called)

    async def fake_complete_metered(system, messages, workspace_id, max_tokens=1024):
        return "reply"

    monkeypatch.setattr(cbsvc.llm, "complete_metered", fake_complete_metered)

    result = await cbsvc.chat("hello", "ws1", "u1", None)

    assert history_called["called"] is False
    assert result["session_id"] is None


async def test_chat_caps_output_at_512_tokens(monkeypatch):
    history_called = {"called": False}
    _install_context_fakes(monkeypatch, cbsvc, history_called=history_called)

    captured = {}

    async def fake_complete_metered(system, messages, workspace_id, max_tokens=1024):
        captured["max_tokens"] = max_tokens
        return "reply"

    monkeypatch.setattr(cbsvc.llm, "complete_metered", fake_complete_metered)

    await cbsvc.chat("hello", "ws1", "u1", None)

    assert captured["max_tokens"] == 512
