"""Timing logs added around complete_metered / complete_metered_stream (plan
Part 2 #1, "measure first") — assert the log fires without changing what the
functions return, plus a streaming smoke test for complete_metered_stream."""

import logging

import app.core.llm as llm_mod
import app.core.quota as quota_mod


async def test_complete_metered_logs_timing_without_changing_return_value(
    monkeypatch, caplog
):
    async def fake_check_quota(workspace_id):
        return 0

    async def fake_record_usage(workspace_id, usage):
        pass

    def fake_complete_raw(system, messages, max_tokens):
        return {
            "reply": "hi there",
            "usage": {"input_tokens": 3, "output_tokens": 2},
            "response_id": "resp_1",
        }

    monkeypatch.setattr(quota_mod, "check_quota", fake_check_quota)
    monkeypatch.setattr(quota_mod, "record_usage", fake_record_usage)
    monkeypatch.setattr(llm_mod, "complete_raw", fake_complete_raw)

    with caplog.at_level(logging.INFO, logger="ai.llm"):
        reply = await llm_mod.complete_metered(
            "sys", [{"role": "user", "content": "hi"}], "ws1"
        )

    assert reply == "hi there"
    assert any("timing" in r.message for r in caplog.records)


async def test_complete_metered_stream_smoke(monkeypatch):
    async def fake_check_quota(workspace_id):
        return 0

    recorded = {}

    async def fake_record_usage(workspace_id, usage):
        recorded["usage"] = usage

    def fake_stream_raw(system, messages, max_tokens):
        return {
            "deltas": ["Hel", "lo"],
            "reply": "Hello",
            "usage": {"input_tokens": 4, "output_tokens": 2},
            "response_id": "resp_2",
        }

    monkeypatch.setattr(quota_mod, "check_quota", fake_check_quota)
    monkeypatch.setattr(quota_mod, "record_usage", fake_record_usage)
    monkeypatch.setattr(llm_mod, "_stream_raw", fake_stream_raw)

    events = [
        e async for e in llm_mod.complete_metered_stream("sys", [], "ws1")
    ]

    deltas = [e["text"] for e in events if e["type"] == "delta"]
    assert deltas == ["Hel", "lo"]
    assert events[-1] == {
        "type": "done",
        "reply": "Hello",
        "usage": {"input_tokens": 4, "output_tokens": 2},
        "response_id": "resp_2",
    }
    assert recorded["usage"] == {"input_tokens": 4, "output_tokens": 2}
