"""Per-caller rate limiting. A loop in the API must not become an unbounded
spend on the model (SEC-1)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.core.ratelimit import RateLimiter
from app.main import create_app
from tests.conftest import API_KEY


def test_calls_inside_the_limit_pass() -> None:
    limiter = RateLimiter(limit=3)
    assert all(limiter.allow("caller", now=100.0 + step) for step in range(3))


def test_the_call_over_the_limit_is_refused() -> None:
    limiter = RateLimiter(limit=2)
    assert limiter.allow("caller", now=100.0)
    assert limiter.allow("caller", now=100.1)
    assert not limiter.allow("caller", now=100.2)


def test_the_window_slides() -> None:
    limiter = RateLimiter(limit=1, window_secs=60)
    assert limiter.allow("caller", now=100.0)
    assert not limiter.allow("caller", now=159.0)
    assert limiter.allow("caller", now=161.0)


def test_callers_are_counted_separately() -> None:
    limiter = RateLimiter(limit=1)
    assert limiter.allow("one", now=100.0)
    assert limiter.allow("two", now=100.0)
    assert not limiter.allow("one", now=100.0)


@pytest.fixture
def tight(tmp_path) -> TestClient:
    config = Settings(
        ai_service_api_key=API_KEY,
        crypto_signing_key_file=tmp_path / "owe1-signing-key.pem",
        app_env="development",
        rate_limit_per_minute=2,
        handshake_rate_limit_per_minute=1,
    )
    return TestClient(create_app(config))


def test_a_caller_over_the_ceiling_is_refused(tight: TestClient) -> None:
    headers = {"x-api-key": API_KEY}
    assert tight.get("/v1/session", headers=headers).status_code != 429
    assert tight.get("/v1/session", headers=headers).status_code != 429

    response = tight.get("/v1/session", headers=headers)
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "RATE_LIMITED"
    assert int(response.headers["retry-after"]) >= 1


def test_the_handshake_has_its_own_ceiling(tight: TestClient) -> None:
    """Lower than the general one, because it is the route that does real
    work before any session exists."""
    headers = {"x-api-key": API_KEY}
    body = {"v": 1, "client_public_key": "x", "client_nonce": "y"}

    assert tight.post("/v1/handshake", headers=headers, json=body).status_code != 429
    assert tight.post("/v1/handshake", headers=headers, json=body).status_code == 429


def test_health_is_never_rate_limited(tight: TestClient) -> None:
    for _ in range(5):
        assert tight.get("/health").status_code == 200
