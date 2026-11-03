"""The model client, configured from the environment.

No test reaches Anthropic: `conftest` resets the client around every test
and this one installs a fake.
"""

from __future__ import annotations

import pytest

from app.config import Settings, settings
from app.core import model


class FakeMessages:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return {"content": [{"type": "text", "text": "ok"}]}


class FakeClient:
    def __init__(self) -> None:
        self.messages = FakeMessages()


def test_the_client_is_built_from_the_environment(monkeypatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")
    monkeypatch.setattr(settings, "model_timeout_secs", 7.0)

    client = model.model_client()

    assert client.api_key == "sk-test"
    assert client.timeout == 7.0
    assert client.max_retries == settings.model_max_retries
    assert model.model_client() is client, "one client per process"


def test_no_key_fails_at_first_use_not_at_startup(monkeypatch) -> None:
    """A checkout without a key still runs everything that does not need
    the model."""
    monkeypatch.setattr(settings, "anthropic_api_key", "")
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
        anthropic_api_key="",
    )
    with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
        config.validate_for_environment()
