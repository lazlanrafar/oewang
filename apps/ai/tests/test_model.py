"""The model client, configured from the environment.

No test reaches Anthropic: `conftest` resets the client around every test
and this one installs a fake.
"""

from __future__ import annotations

import pytest

from app.config import Settings, settings
from app.core import model


class FakeStream:
    def __init__(self, message: object) -> None:
        self.message = message

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def get_final_message(self):
        return self.message


class FakeMessages:
    def __init__(self) -> None:
        self.calls: list[dict] = []
        self.final: object = {"content": [{"type": "text", "text": "ok"}]}

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.final

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        return FakeStream(self.final)


class FakeClient:
    def __init__(self) -> None:
        self.messages = FakeMessages()


def test_the_client_is_built_from_the_environment(monkeypatch) -> None:
    monkeypatch.setattr(settings, "ai_api_key", "sk-test")
    monkeypatch.setattr(settings, "ai_base_url", "")
    monkeypatch.setattr(settings, "model_timeout_secs", 7.0)

    client = model.model_client()

    assert client.api_key == "sk-test"
    assert client.timeout == 7.0
    assert client.max_retries == settings.model_max_retries
    assert str(client.base_url).startswith("https://api.anthropic.com")
    assert model.model_client() is client, "one client per process"


def test_a_gateway_replaces_the_default_endpoint(monkeypatch) -> None:
    """The same SDK, pointed somewhere else (D67). Everything downstream
    stays unaware of which provider actually answers."""
    monkeypatch.setattr(settings, "ai_api_key", "sk-test")
    monkeypatch.setattr(settings, "ai_base_url", "http://host.docker.internal:20128")

    client = model.model_client()

    assert str(client.base_url).startswith("http://host.docker.internal:20128")


def test_no_key_fails_at_first_use_not_at_startup(monkeypatch) -> None:
    """A checkout without a key still runs everything that does not need
    the model."""
    monkeypatch.setattr(settings, "ai_api_key", "")
    with pytest.raises(model.ModelUnavailable):
        model.model_client()


async def test_a_fake_client_is_what_the_tests_call() -> None:
    fake = FakeClient()
    model.set_model_client(fake)

    result = await model.model_client().messages.create(model="claude-haiku-5-5", messages=[])

    assert result["content"][0]["text"] == "ok"
    assert fake.messages.calls[0]["model"] == "claude-haiku-5-5"


def test_production_requires_a_key() -> None:
    config = Settings(
        app_env="production",
        ai_service_api_key="a" * 32,
        ai_api_key="",
    )
    with pytest.raises(ValueError, match="AI_API_KEY"):
        config.validate_for_environment()


async def test_complete_assembles_the_answer_from_a_stream() -> None:
    """Not `messages.create`: a gateway may answer every request as an
    event stream, and the SDK cannot parse that as JSON (D67)."""
    fake = FakeClient()
    model.set_model_client(fake)

    result = await model.complete(model="free-main", max_tokens=16, messages=[])

    assert result == fake.messages.final
    assert fake.messages.calls[0]["model"] == "free-main"
