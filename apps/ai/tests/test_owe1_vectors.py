"""Run the shared OWE1 vectors.

The same file is run by the Rust implementation that generated it and by the
Node client in apps/app. If any of the three changes its bytes, this fails.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey

from app.core import owe1


def _vectors_path() -> Path:
    """Mounted read-only in the container, repo-relative when run natively."""
    from_env = os.environ.get("OWE1_VECTORS_PATH")
    if from_env:
        return Path(from_env)
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "apps/api/crates/domain/testdata/owe1-vectors.json"
        if candidate.exists():
            return candidate
    raise AssertionError("shared OWE1 vectors not found; set OWE1_VECTORS_PATH")


VECTORS_PATH = _vectors_path()


@pytest.fixture(scope="module")
def vectors() -> dict:
    assert VECTORS_PATH.exists(), f"shared vectors missing at {VECTORS_PATH}"
    return json.loads(VECTORS_PATH.read_text())


@pytest.fixture(scope="module")
def keys(vectors: dict) -> owe1.SessionKeys:
    inputs = vectors["inputs"]
    client_private = X25519PrivateKey.from_private_bytes(owe1.unb64(inputs["client_secret"]))
    return owe1.derive_keys(
        client_private,
        owe1.unb64(inputs["server_public_key"]),
        owe1.unb64(inputs["client_nonce"]),
        owe1.unb64(inputs["server_nonce"]),
        inputs["session_id"],
    )


def test_derives_the_same_keys_as_the_rust_implementation(vectors, keys):
    derived = vectors["derived"]
    assert owe1.b64(keys.client_to_server) == derived["k_c2s"]
    assert owe1.b64(keys.server_to_client) == derived["k_s2c"]


def test_builds_the_same_transcript(vectors):
    inputs = vectors["inputs"]
    built = owe1.transcript(
        owe1.unb64(inputs["client_public_key"]),
        owe1.unb64(inputs["server_public_key"]),
        owe1.unb64(inputs["client_nonce"]),
        owe1.unb64(inputs["server_nonce"]),
        inputs["session_id"],
        inputs["expires_at"],
        inputs["timestamp"],
    )
    assert owe1.b64(built) == vectors["derived"]["transcript"]


def test_derives_the_same_key_id(vectors):
    public = owe1.unb64(vectors["inputs"]["server_public_key"])
    assert owe1.key_id(public) == vectors["derived"]["key_id_of_server_public"]


@pytest.mark.parametrize(
    ("name", "direction"),
    [
        ("request", "client_to_server"),
        ("query", "client_to_server"),
        ("response", "server_to_client"),
        ("stream_event", "server_to_client"),
    ],
)
def test_opens_every_sealed_vector(vectors, keys, name, direction):
    message = vectors["messages"][name]
    key = getattr(keys, direction)
    opened = owe1.open_sealed(key, message["aad"].encode(), message["sealed"])
    assert opened.decode() == message["plaintext"]


@pytest.mark.parametrize(
    ("name", "direction"),
    [
        ("request", "client_to_server"),
        ("response", "server_to_client"),
    ],
)
def test_reproduces_the_exact_ciphertext_with_the_fixed_nonce(vectors, keys, name, direction):
    """Opening proves compatibility; reproducing proves the encoding matches
    byte for byte, which is what stops a subtle base64 or AAD difference."""
    message = vectors["messages"][name]
    sealed = owe1.seal(
        getattr(keys, direction),
        message["aad"].encode(),
        message["plaintext"].encode(),
        nonce=owe1.unb64(vectors["inputs"]["seal_nonce"]),
    )
    assert sealed == message["sealed"]


def test_builds_the_same_associated_data(vectors):
    inputs = vectors["inputs"]
    session, request_id, ts = inputs["session_id"], inputs["request_id"], inputs["timestamp"]

    assert (
        owe1.aad_request(session, "POST", "/v1/transactions", request_id, ts).decode()
        == vectors["messages"]["request"]["aad"]
    )
    assert (
        owe1.aad_query(session, "GET", "/v1/transactions", request_id, ts).decode()
        == vectors["messages"]["query"]["aad"]
    )
    assert (
        owe1.aad_response(session, request_id, 201).decode()
        == vectors["messages"]["response"]["aad"]
    )
    assert (
        owe1.aad_stream_event(session, request_id, 0).decode()
        == vectors["messages"]["stream_event"]["aad"]
    )


def test_rejects_a_tampered_ciphertext(vectors, keys):
    message = vectors["messages"]["response"]
    sealed = dict(message["sealed"])
    sealed["c"] = ("B" if sealed["c"][0] == "A" else "A") + sealed["c"][1:]

    with pytest.raises(owe1.Owe1Error):
        owe1.open_sealed(keys.server_to_client, message["aad"].encode(), sealed)


def test_rejects_a_message_bound_to_another_status(vectors, keys):
    message = vectors["messages"]["response"]
    inputs = vectors["inputs"]
    swapped = owe1.aad_response(inputs["session_id"], inputs["request_id"], 200)

    with pytest.raises(owe1.Owe1Error):
        owe1.open_sealed(keys.server_to_client, swapped, message["sealed"])


def test_rejects_a_low_order_public_key():
    private = X25519PrivateKey.generate()
    with pytest.raises(owe1.Owe1Error):
        owe1.derive_keys(private, bytes(32), bytes(16), bytes(16), "cs_a")


def test_keys_never_print():
    keys = owe1.SessionKeys(client_to_server=b"\x01" * 32, server_to_client=b"\x02" * 32)
    assert repr(keys) == "SessionKeys([redacted])"
    assert "\\x01" not in repr(keys)


def test_field_round_trip():
    key = b"\x09" * 32
    aad = owe1.aad_query("cs_a", "GET", "/v1/transactions", "req_1", 1)
    field = owe1.seal_field(key, aad, b"type=expense&page=2")
    assert owe1.open_field(key, aad, field) == b"type=expense&page=2"
    assert owe1.open_field(key, aad, "") == b""
