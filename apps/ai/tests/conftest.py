from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, settings
from app.core import model
from app.main import create_app
from tests.support import Owe1TestClient

API_KEY = "test-service-key"


@pytest.fixture
def config(tmp_path: Path) -> Settings:
    """Development settings with a throwaway signing key, so a test never
    touches the key the local stack created."""
    return Settings(
        ai_service_api_key=API_KEY,
        crypto_signing_key_file=tmp_path / "owe1-signing-key.pem",
        app_env="development",
        ai_api_key="",
    )


@pytest.fixture
def http(config: Settings) -> TestClient:
    return TestClient(create_app(config))


@pytest.fixture
def owe1_client(http: TestClient) -> Owe1TestClient:
    client = Owe1TestClient(http=http, api_key=API_KEY)
    client.handshake()
    return client


@pytest.fixture(autouse=True)
def no_real_model():
    """No test reaches a provider.

    Two halves, and the second one is not belt and braces. The client is
    reset around every test, so one installing a fake cannot leak it into
    the next. The configured key is also blanked, because `model_client`
    reads the process-wide `settings` rather than a test's own `Settings`:
    a test that forgets to install a fake would otherwise build a real
    client against whatever `.env` the checkout has and spend twenty
    seconds per call discovering that the gateway is not listening. A test
    that wants a key monkeypatches one back.
    """
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(settings, "ai_api_key", "")
        model.set_model_client(None)
        yield
        model.set_model_client(None)
