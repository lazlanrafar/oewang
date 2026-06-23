from unittest.mock import patch

from fastapi.testclient import TestClient

import app.modules.chatbot.service as cbsvc
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


async def test_web_chat_returns_full_contract(monkeypatch):
    # chat_begin (identity/session/quota/prompt) + chat_end (persist/usage) live
    # in Elysia; web_chat just drives the loop between them.
    async def fake_begin(token, messages, session_id, web_search):
        assert token == "tok"
        return {
            "kind": "ready",
            "workspace_id": "w1",
            "user_id": "u1",
            "session_id": "s1",
            "system_prompt": "SYS",
            "history": [{"role": "user", "content": "hi"}],
            "current_tokens": 100,
        }

    captured = {}

    async def fake_loop(system, convo, tool_specs, run_tool, max_steps=10):
        captured["system"] = system
        return {
            "reply": "Hello",
            "usage": {"input_tokens": 10, "output_tokens": 5},
            "artifact": {"type": "spending-canvas", "payload": {}},
            "response_id": "resp_1",
        }

    async def fake_end(workspace_id, session_id, result, current_tokens):
        captured["ended"] = (workspace_id, session_id, current_tokens)

    monkeypatch.setattr(cbsvc.tools, "chat_begin", fake_begin)
    monkeypatch.setattr(cbsvc.llm, "complete_with_tools", fake_loop)
    monkeypatch.setattr(cbsvc.tools, "chat_end", fake_end)

    res = await cbsvc.web_chat([{"role": "user", "content": "hi"}], "tok", "s1", False)
    assert res["reply"] == "Hello"
    assert res["session_id"] == "s1"
    assert res["usage"]["output_tokens"] == 5
    assert res["provider"]["name"] == "openai"
    assert res["artifact"]["type"] == "spending-canvas"
    assert captured["system"] == "SYS"
    # tokens incremented against the count read at begin
    assert captured["ended"] == ("w1", "s1", 100)


async def test_web_chat_early_reply_skips_loop(monkeypatch):
    # Receipt-draft turns return an early reply from chat_begin; no LLM/chat_end.
    async def fake_begin(token, messages, session_id, web_search):
        return {"kind": "early", "session_id": "s9", "reply": "Confirm the receipt."}

    def boom(*a, **k):
        raise AssertionError("loop must not run on an early reply")

    monkeypatch.setattr(cbsvc.tools, "chat_begin", fake_begin)
    monkeypatch.setattr(cbsvc.llm, "complete_with_tools", boom)

    res = await cbsvc.web_chat([{"role": "user", "content": "hi"}], "tok", None, False)
    assert res["reply"] == "Confirm the receipt."
    assert res["session_id"] == "s9"
    assert res["artifact"] is None


# ── Tool-loop logic (the canvas/money path) ─────────────────────────────────


class _FakeFn:
    def __init__(self, name, arguments):
        self.name = name
        self.arguments = arguments


class _FakeToolCall:
    def __init__(self, id, name, arguments):
        self.id = id
        self.function = _FakeFn(name, arguments)


class _FakeMsg:
    def __init__(self, content=None, tool_calls=None):
        self.content = content
        self.tool_calls = tool_calls

    def model_dump(self, exclude_none=False):
        return {"role": "assistant", "tool_calls": "<opaque>"}


class _FakeUsage:
    prompt_tokens = 10
    completion_tokens = 5


class _FakeResp:
    def __init__(self, msg):
        self.id = "resp_x"
        self.usage = _FakeUsage()
        self.choices = [type("C", (), {"message": msg})()]


class _FakeClient:
    """Returns canned responses in order; emulates client.chat.completions.create."""

    def __init__(self, responses):
        self._responses = responses
        self._i = 0

    @property
    def chat(self):
        return self

    @property
    def completions(self):
        return self

    def create(self, **kwargs):
        r = self._responses[self._i]
        self._i += 1
        return r


async def test_tool_loop_captures_artifact_and_usage(monkeypatch):
    import app.core.llm as llm_mod

    step1 = _FakeMsg(tool_calls=[_FakeToolCall("tc1", "getSpendingAnalysis", "{}")])
    step2 = _FakeMsg(content="You spent a lot this month.")
    client = _FakeClient([_FakeResp(step1), _FakeResp(step2)])
    monkeypatch.setattr(llm_mod, "get_client", lambda: client)

    seen = []

    async def fake_execute(name, args):
        seen.append(name)
        return {
            "result": {"data": {"metrics": {"totalSpending": 500}}},
            "artifact": {"type": "spending-canvas", "payload": {"x": 1}},
        }

    out = await llm_mod.complete_with_tools(
        "sys",
        [{"role": "user", "content": "how much did I spend?"}],
        [],
        fake_execute,
        max_steps=5,
    )

    assert seen == ["getSpendingAnalysis"]
    assert out["reply"] == "You spent a lot this month."
    assert out["artifact"]["type"] == "spending-canvas"
    # two completion calls, 5 output tokens each
    assert out["usage"]["output_tokens"] == 10
    assert out["usage"]["input_tokens"] == 20
