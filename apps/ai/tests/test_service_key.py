"""The shared key between the API and this service (D4, SEC-1)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import API_KEY


def test_health_needs_no_key(http: TestClient) -> None:
    """The container healthcheck runs without credentials."""
    assert http.get("/health").status_code == 200


def test_published_keys_need_no_key(http: TestClient) -> None:
    """A client needs the signing key before it can do anything else."""
    response = http.get("/.well-known/oewang-keys")
    assert response.status_code == 200
    assert response.json()[0]["algorithm"] == "Ed25519"


def test_a_route_without_the_key_is_refused(http: TestClient) -> None:
    response = http.post(
        "/v1/handshake", json={"v": 1, "client_public_key": "x", "client_nonce": "y"}
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_a_wrong_key_is_refused(http: TestClient) -> None:
    response = http.get("/v1/session", headers={"x-api-key": API_KEY + "-wrong"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_an_unauthorized_answer_stays_plaintext(http: TestClient) -> None:
    """The caller may hold no key, which is the whole reason it is an
    error, so this body is never sealed."""
    response = http.get("/v1/session")
    assert response.headers["x-owe-transport-error"] == "1"
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
