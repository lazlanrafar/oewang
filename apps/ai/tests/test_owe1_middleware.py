"""The OWE1 layer this service runs, driven by a real client.

The vector tests prove the three implementations agree on the bytes; these
prove the middleware enforces what the doc says it enforces: a signed
handshake, replay rejection, tamper detection, and a query string that
cannot be stripped.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.core import owe1, sessions
from app.main import create_app
from tests.conftest import API_KEY
from tests.support import Owe1TestClient


def test_a_handshake_signature_verifies(owe1_client: Owe1TestClient) -> None:
    """The fixture refuses to build a client whose signature does not
    verify, so reaching here is the assertion."""
    assert owe1_client.session_id.startswith("cs_")
    assert owe1_client.keys is not None


def test_a_sealed_round_trip(owe1_client: Owe1TestClient) -> None:
    body = owe1_client.call("GET", "/v1/session")["data"]
    assert body["session_id"] == owe1_client.session_id
    assert body["expires_at"] > body["server_time"]


def test_the_response_is_not_readable_as_plaintext(owe1_client: Owe1TestClient) -> None:
    response, _ = owe1_client.request("GET", "/v1/session")
    assert response.headers["content-type"] == owe1.CONTENT_TYPE
    assert response.headers["cache-control"] == "no-store"
    assert set(response.json()) == {"n", "c"}


def test_a_request_without_a_session_is_refused(http: TestClient) -> None:
    response = http.get("/v1/session", headers={"x-api-key": API_KEY})
    assert response.json()["error"]["code"] == "CRYPTO_SESSION_UNKNOWN"


def test_an_unknown_session_is_refused(owe1_client: Owe1TestClient) -> None:
    response, _ = owe1_client.request("GET", "/v1/session", session_id="cs_nosuchsession")
    assert response.json()["error"]["code"] == "CRYPTO_SESSION_UNKNOWN"


def test_a_replayed_request_id_is_refused(owe1_client: Owe1TestClient) -> None:
    response, request_id = owe1_client.request("GET", "/v1/session")
    assert response.status_code == 200

    again, _ = owe1_client.request("GET", "/v1/session", request_id=request_id)
    assert again.json()["error"]["code"] == "CRYPTO_REPLAY_DETECTED"


def test_a_stale_timestamp_is_refused(owe1_client: Owe1TestClient) -> None:
    stale = owe1.now_secs() - sessions.CLOCK_SKEW_TOLERANCE_SECS - 5
    response, _ = owe1_client.request("GET", "/v1/session", timestamp=stale)

    error = response.json()["error"]
    assert error["code"] == "CRYPTO_CLOCK_SKEW"
    # The server's time travels with the error so the client can correct
    # its offset and retry once.
    assert abs(error["server_time"] - owe1.now_secs()) <= 2


def test_a_plaintext_query_string_is_refused(owe1_client: Owe1TestClient) -> None:
    response, _ = owe1_client.request("GET", "/v1/session", plaintext_query="limit=5")
    assert response.json()["error"]["code"] == "CRYPTO_QUERY_NOT_ENCRYPTED"


def test_a_missing_query_header_is_refused(owe1_client: Owe1TestClient) -> None:
    assert owe1_client.keys is not None
    response = owe1_client.http.get(
        "/v1/session",
        headers={
            "x-api-key": API_KEY,
            "x-owe-session": owe1_client.session_id,
            "x-owe-request-id": "REQ1",
            "x-owe-timestamp": str(owe1.now_secs()),
        },
    )
    assert response.json()["error"]["code"] == "CRYPTO_QUERY_NOT_ENCRYPTED"


def test_a_tampered_body_is_refused(owe1_client: Owe1TestClient) -> None:
    assert owe1_client.keys is not None
    timestamp = owe1.now_secs()
    request_id = "REQTAMPER"
    sealed = owe1.seal(
        owe1_client.keys.client_to_server,
        owe1.aad_request(owe1_client.session_id, "POST", "/v1/session", request_id, timestamp),
        b'{"hello":"world"}',
    )
    flipped = "B" if sealed["c"][0] == "A" else "A"
    sealed["c"] = flipped + sealed["c"][1:]

    response = owe1_client.http.post(
        "/v1/session",
        headers={
            "x-api-key": API_KEY,
            "content-type": owe1.CONTENT_TYPE,
            "x-owe-session": owe1_client.session_id,
            "x-owe-request-id": request_id,
            "x-owe-timestamp": str(timestamp),
            "x-owe-query": owe1.seal_field(
                owe1_client.keys.client_to_server,
                owe1.aad_query(
                    owe1_client.session_id, "POST", "/v1/session", request_id, timestamp
                ),
                b"",
            ),
        },
        content=json.dumps(sealed),
    )
    assert response.json()["error"]["code"] == "CRYPTO_DECRYPT_FAILED"


def test_a_handshake_with_another_version_is_refused(http: TestClient) -> None:
    response = http.post(
        "/v1/handshake",
        headers={"x-api-key": API_KEY},
        json={
            "v": 2,
            "client_public_key": owe1.b64(bytes(32)),
            "client_nonce": owe1.b64(bytes(16)),
        },
    )
    assert response.json()["error"]["code"] == "CRYPTO_VERSION_UNSUPPORTED"


def test_a_low_order_public_key_is_refused(http: TestClient) -> None:
    """Accepting one would mean deriving a key the attacker already knows."""
    response = http.post(
        "/v1/handshake",
        headers={"x-api-key": API_KEY},
        json={
            "v": 1,
            "client_public_key": owe1.b64(bytes(32)),
            "client_nonce": owe1.b64(bytes(16)),
        },
    )
    assert response.json()["error"]["code"] == "CRYPTO_DECRYPT_FAILED"


def test_a_malformed_key_length_is_refused(http: TestClient) -> None:
    response = http.post(
        "/v1/handshake",
        headers={"x-api-key": API_KEY},
        json={"v": 1, "client_public_key": owe1.b64(b"short"), "client_nonce": owe1.b64(bytes(16))},
    )
    assert response.json()["error"]["code"] == "CRYPTO_DECRYPT_FAILED"


@pytest.fixture
def plaintext_mode(tmp_path) -> TestClient:
    config = Settings(
        ai_service_api_key=API_KEY,
        crypto_signing_key_file=tmp_path / "owe1-signing-key.pem",
        app_env="development",
        owe1_enabled=False,
    )
    return TestClient(create_app(config))


def test_plaintext_mode_is_development_only(plaintext_mode: TestClient, tmp_path) -> None:
    """It exists for local debugging; anywhere else it would quietly undo
    D22, so the config refuses rather than warns."""
    assert plaintext_mode.get("/v1/session", headers={"x-api-key": API_KEY}).status_code == 200

    production = Settings(
        ai_service_api_key="a" * 32,
        ai_api_key="set",
        crypto_signing_key_file=tmp_path / "k.pem",
        app_env="production",
        owe1_enabled=False,
    )
    with pytest.raises(ValueError, match="only be disabled in development"):
        production.validate_for_environment()
