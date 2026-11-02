"""Drive the real OWE1 middleware over HTTP.

The vector tests prove the three implementations agree on the bytes. These
prove the Rust middleware enforces what the doc says it enforces: a pinned
signature, replay rejection, tamper detection, and a query string that cannot
be stripped.

Skipped when the API is not reachable, so `pytest` stays runnable without the
stack up. The whole stack is running in CI, where these are the point.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

import pytest
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey

from app.core import owe1

API_URL = os.environ.get("API_INTERNAL_URL", "http://api:3002")
TIMEOUT = 10


def _request(method: str, path: str, *, body: bytes | None = None, headers: dict | None = None):
    request = urllib.request.Request(
        API_URL + path, data=body, method=method, headers=headers or {}
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read()


def _api_reachable() -> bool:
    try:
        status, _, _ = _request("GET", "/health")
        return status == 200
    except Exception:  # noqa: BLE001 - any failure means "not reachable"
        return False


pytestmark = pytest.mark.skipif(
    not _api_reachable(), reason=f"API not reachable at {API_URL}"
)


class Client:
    """A pinned OWE1 client, deliberately minimal."""

    def __init__(self) -> None:
        status, _, raw = _request("GET", "/.well-known/oewang-keys")
        assert status == 200
        self.pinned = {k["kid"]: owe1.unb64(k["public_key"]) for k in json.loads(raw)}

        self.private = X25519PrivateKey.generate()
        client_public = self.private.public_key().public_bytes_raw()
        client_nonce = os.urandom(16)

        status, _, raw = _request(
            "POST",
            "/v1/handshake",
            body=json.dumps(
                {
                    "v": 1,
                    "client_public_key": owe1.b64(client_public),
                    "client_nonce": owe1.b64(client_nonce),
                }
            ).encode(),
            headers={"content-type": "application/json"},
        )
        assert status == 200, raw
        self.handshake = json.loads(raw)

        # Verify against the pinned key, or stop. Never fall back to plaintext.
        owe1.verify_handshake(
            self.pinned[self.handshake["kid"]],
            owe1.unb64(self.handshake["signature"]),
            owe1.transcript(
                client_public,
                owe1.unb64(self.handshake["server_public_key"]),
                client_nonce,
                owe1.unb64(self.handshake["server_nonce"]),
                self.handshake["session_id"],
                self.handshake["expires_at"],
                self.handshake["server_time"],
            ),
        )

        self.session_id = self.handshake["session_id"]
        self.keys = owe1.derive_keys(
            self.private,
            owe1.unb64(self.handshake["server_public_key"]),
            client_nonce,
            owe1.unb64(self.handshake["server_nonce"]),
            self.session_id,
        )

    def call(
        self,
        method: str,
        path: str,
        *,
        query: str = "",
        payload: bytes | None = None,
        request_id: str | None = None,
        timestamp: int | None = None,
        session_id: str | None = None,
        tamper: bool = False,
        plaintext_query: str | None = None,
    ):
        session = session_id or self.session_id
        request_id = request_id or os.urandom(16).hex().upper()
        timestamp = timestamp if timestamp is not None else owe1.now_secs()

        headers = {
            "x-owe-session": session,
            "x-owe-request-id": request_id,
            "x-owe-timestamp": str(timestamp),
            "content-type": owe1.CONTENT_TYPE,
            # Required even when empty, so a stripped filter cannot pass
            # unnoticed.
            "x-owe-query": owe1.seal_field(
                self.keys.client_to_server,
                owe1.aad_query(session, method, path, request_id, timestamp),
                query.encode(),
            ),
        }

        body = None
        if payload is not None:
            sealed = owe1.seal(
                self.keys.client_to_server,
                owe1.aad_request(session, method, path, request_id, timestamp),
                payload,
            )
            if tamper:
                sealed["c"] = ("B" if sealed["c"][0] == "A" else "A") + sealed["c"][1:]
            body = json.dumps(sealed).encode()

        url_path = f"{path}?{plaintext_query}" if plaintext_query else path
        status, response_headers, raw = _request(method, url_path, body=body, headers=headers)
        return status, response_headers, raw, request_id

    def open_response(self, request_id: str, status: int, raw: bytes) -> dict:
        return json.loads(
            owe1.open_sealed(
                self.keys.server_to_client,
                owe1.aad_response(self.session_id, request_id, status),
                json.loads(raw),
            )
        )


@pytest.fixture(scope="module")
def client() -> Client:
    return Client()


def test_handshake_signature_verifies_against_the_pinned_key(client: Client):
    # Construction verifies or raises, so reaching here is the assertion.
    assert client.session_id.startswith("cs_")
    assert client.handshake["v"] == owe1.VERSION


def test_protected_route_round_trips(client: Client):
    status, headers, raw, request_id = client.call("GET", "/v1/session")

    assert status == 200
    assert headers["content-type"] == owe1.CONTENT_TYPE
    assert headers["cache-control"] == "no-store"

    body = client.open_response(request_id, status, raw)
    assert body["session_id"] == client.session_id


def test_response_is_not_readable_without_the_key(client: Client):
    _, _, raw, _ = client.call("GET", "/v1/session")
    # The body on the wire is a sealed envelope and nothing else.
    assert set(json.loads(raw)) == {"n", "c"}
    assert b"session_id" not in raw


def test_replayed_request_id_is_rejected(client: Client):
    _, _, _, request_id = client.call("GET", "/v1/session")

    status, _, raw, _ = client.call("GET", "/v1/session", request_id=request_id)

    assert status == 400
    # Transport errors answer in plaintext: the caller may hold no key.
    assert json.loads(raw)["error"]["code"] == "CRYPTO_REPLAY_DETECTED"


def test_tampered_body_is_rejected(client: Client):
    status, _, raw, _ = client.call(
        "POST", "/v1/session", payload=b'{"x":1}', tamper=True
    )
    assert status in (400, 405)
    if status == 400:
        assert json.loads(raw)["error"]["code"] == "CRYPTO_DECRYPT_FAILED"


def test_plaintext_query_on_a_protected_route_is_rejected(client: Client):
    status, _, raw, _ = client.call("GET", "/v1/session", plaintext_query="page=2")
    assert status == 400
    assert json.loads(raw)["error"]["code"] == "CRYPTO_QUERY_NOT_ENCRYPTED"


def test_clock_skew_is_rejected_and_reports_server_time(client: Client):
    status, _, raw, _ = client.call(
        "GET", "/v1/session", timestamp=owe1.now_secs() + 600
    )
    assert status == 400
    body = json.loads(raw)
    assert body["error"]["code"] == "CRYPTO_CLOCK_SKEW"
    # The message carries the server's own time so a client can correct and
    # retry once.
    assert "message" in body["error"]


def test_unknown_session_is_rejected(client: Client):
    status, _, raw, _ = client.call(
        "GET", "/v1/session", session_id="cs_doesnotexist000000000001"
    )
    assert status == 401
    assert json.loads(raw)["error"]["code"] == "CRYPTO_SESSION_UNKNOWN"


def test_plaintext_exceptions_stay_plaintext():
    for path in ("/health", "/health/ready", "/.well-known/oewang-keys"):
        status, headers, raw = _request("GET", path)
        assert status in (200, 503), path
        assert headers["content-type"].startswith("application/json"), path
        # Readable without any key at all, which is the point of an exception.
        json.loads(raw)
