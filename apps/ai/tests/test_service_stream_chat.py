"""stream_chat() (plan Part 2 #4, the fake-streaming Telegram fix): ordered
content deltas, one final done event, and — critically — quota.record_usage
firing exactly once per stream (not once per delta)."""

import app.core.llm as llm_mod
import app.modules.chatbot.service as cbsvc


async def _fake_context(workspace_id, session_id):
    return 0.0, [], {}, []


async def test_stream_chat_yields_ordered_deltas_then_done(monkeypatch):
    async def fake_stream(system, messages, workspace_id, max_tokens=1024):
        for text in ["Hel", "lo "]:
            yield {"type": "delta", "text": text}
        yield {
            "type": "done",
            "reply": "Hello there",
            "usage": {"input_tokens": 5, "output_tokens": 2},
            "response_id": "resp_1",
        }

    monkeypatch.setattr(cbsvc, "_chat_context", _fake_context)
    monkeypatch.setattr(cbsvc.llm, "complete_metered_stream", fake_stream)

    events = [e async for e in cbsvc.stream_chat("hi", "ws1", "u1", "s1")]

    assert events[0] == {"event": "content", "data": {"text": "Hel"}}
    assert events[1] == {"event": "content", "data": {"text": "lo "}}
    assert events[2]["event"] == "done"
    assert events[2]["data"]["reply"] == "Hello there"
    assert events[2]["data"]["session_id"] == "s1"
    assert events[2]["data"]["usage"] == {"input_tokens": 5, "output_tokens": 2}


async def test_stream_chat_records_usage_exactly_once_not_per_delta(monkeypatch):
    """stream_chat bypasses complete_metered entirely, so the quota gating
    lives inside llm.complete_metered_stream — assert check_quota/record_usage
    each run exactly once for a multi-delta stream, mirroring what
    complete_metered does for the non-streaming path."""
    import app.core.quota as quota_mod

    monkeypatch.setattr(cbsvc, "_chat_context", _fake_context)

    check_calls = []
    record_calls = []

    async def fake_check_quota(workspace_id):
        check_calls.append(workspace_id)
        return 0

    async def fake_record_usage(workspace_id, usage):
        record_calls.append((workspace_id, usage))

    def fake_stream_raw(system, messages, max_tokens):
        return {
            "deltas": ["a", "b", "c"],
            "reply": "abc",
            "usage": {"input_tokens": 7, "output_tokens": 3},
            "response_id": "resp_x",
        }

    monkeypatch.setattr(quota_mod, "check_quota", fake_check_quota)
    monkeypatch.setattr(quota_mod, "record_usage", fake_record_usage)
    monkeypatch.setattr(llm_mod, "_stream_raw", fake_stream_raw)

    events = [e async for e in cbsvc.stream_chat("hi", "ws1", "u1", None)]

    assert len(check_calls) == 1
    assert len(record_calls) == 1
    assert record_calls[0] == ("ws1", {"input_tokens": 7, "output_tokens": 3})
    content_events = [e for e in events if e["event"] == "content"]
    assert [e["data"]["text"] for e in content_events] == ["a", "b", "c"]
    assert events[-1]["event"] == "done"
    assert events[-1]["data"]["reply"] == "abc"
