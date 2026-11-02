"""OWE1 payload encryption, Python side.

The wire contract is specified in docs/api/encryption.md and pinned by the
shared vectors at apps/api/crates/domain/testdata/owe1-vectors.json. This
module and its Rust and Node counterparts run the same file, because three
implementations of one protocol drift unless something holds them to the
same bytes.

Only the primitives named in the doc are used, all from `cryptography`.
"""

from __future__ import annotations

import base64
import os
import time
from dataclasses import dataclass

from cryptography.exceptions import InvalidSignature, InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

VERSION = 1
NONCE_LEN = 12
TRANSCRIPT_LABEL = b"oewang/owe1/handshake"
INFO_C2S = b"oewang/owe1/c2s/"
INFO_S2C = b"oewang/owe1/s2c/"
CONTENT_TYPE = "application/vnd.oewang.owe1+json"


class Owe1Error(Exception):
    """Any failure to open, verify or derive. Deliberately undifferentiated:
    a caller must not branch on why a message failed to open."""


def b64(data: bytes) -> str:
    """base64url without padding (RFC 4648 section 5)."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def unb64(value: str) -> bytes:
    try:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except Exception as exc:  # noqa: BLE001 - any decode failure is the same failure
        raise Owe1Error("malformed base64url") from exc


# ---------------------------------------------------------------- associated data
#
# Changing one of these byte strings breaks every client. They are the wire
# contract, not an implementation detail.


def aad_request(session_id: str, method: str, path: str, request_id: str, timestamp: int) -> bytes:
    return f"OWE1|req|{session_id}|{method}|{path}|{request_id}|{timestamp}".encode()


def aad_query(session_id: str, method: str, path: str, request_id: str, timestamp: int) -> bytes:
    return f"OWE1|qry|{session_id}|{method}|{path}|{request_id}|{timestamp}".encode()


def aad_response(session_id: str, request_id: str, status: int) -> bytes:
    return f"OWE1|res|{session_id}|{request_id}|{status}".encode()


def aad_stream_event(session_id: str, request_id: str, seq: int) -> bytes:
    return f"OWE1|sse|{session_id}|{request_id}|{seq}".encode()


# ---------------------------------------------------------------- handshake


@dataclass(frozen=True)
class SessionKeys:
    client_to_server: bytes
    server_to_client: bytes

    def __repr__(self) -> str:  # keys never print (OPS-3)
        return "SessionKeys([redacted])"


def derive_keys(
    private_key: X25519PrivateKey,
    peer_public: bytes,
    client_nonce: bytes,
    server_nonce: bytes,
    session_id: str,
) -> SessionKeys:
    try:
        shared = private_key.exchange(X25519PublicKey.from_public_bytes(peer_public))
    except ValueError as exc:
        # `cryptography` refuses a low-order point here, before any shared
        # secret exists. Rust reaches the same conclusion one step later, via
        # was_contributory(). Both end in the same refusal.
        raise Owe1Error("low order point") from exc

    # Belt and braces: an implementation that returns an all-zero secret
    # rather than raising must not get past this point either. Accepting one
    # would mean deriving a key the attacker already knows.
    if shared == bytes(len(shared)):
        raise Owe1Error("low order point")

    salt = client_nonce + server_nonce

    def expand(info: bytes) -> bytes:
        return HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=info).derive(shared)

    return SessionKeys(
        client_to_server=expand(INFO_C2S + session_id.encode()),
        server_to_client=expand(INFO_S2C + session_id.encode()),
    )


def transcript(
    client_public: bytes,
    server_public: bytes,
    client_nonce: bytes,
    server_nonce: bytes,
    session_id: str,
    expires_at: int,
    server_time: int,
) -> bytes:
    """Every binary part is fixed size and the session id has a fixed shape,
    so the concatenation is unambiguous without length prefixes."""
    return (
        TRANSCRIPT_LABEL
        + client_public
        + server_public
        + client_nonce
        + server_nonce
        + session_id.encode()
        + b"|"
        + str(expires_at).encode()
        + b"|"
        + str(server_time).encode()
    )


def key_id(public_key: bytes) -> str:
    digest = hashes.Hash(hashes.SHA256())
    digest.update(public_key)
    return "k-" + b64(digest.finalize())[:12]


def verify_handshake(pinned_public_key: bytes, signature: bytes, body: bytes) -> None:
    """Verify or raise. A client that cannot verify stops; it never falls back
    to plaintext (docs/api/encryption.md#handshake)."""
    try:
        Ed25519PublicKey.from_public_bytes(pinned_public_key).verify(signature, body)
    except InvalidSignature as exc:
        raise Owe1Error("handshake signature did not verify") from exc


# ---------------------------------------------------------------- seal and open


def seal(key: bytes, aad: bytes, plaintext: bytes, nonce: bytes | None = None) -> dict[str, str]:
    """A fresh random nonce per message unless one is supplied, which only the
    vector tests do."""
    nonce = nonce or os.urandom(NONCE_LEN)
    ciphertext = AESGCM(key).encrypt(nonce, plaintext, aad)
    return {"n": b64(nonce), "c": b64(ciphertext)}


def open_sealed(key: bytes, aad: bytes, body: dict[str, str]) -> bytes:
    nonce = unb64(body["n"])
    if len(nonce) != NONCE_LEN:
        raise Owe1Error("malformed nonce")
    try:
        return AESGCM(key).decrypt(nonce, unb64(body["c"]), aad)
    except InvalidTag as exc:
        raise Owe1Error("decryption failed") from exc


def seal_field(key: bytes, aad: bytes, plaintext: bytes) -> str:
    """Header-carried fields travel as `nonce.ciphertext`."""
    body = seal(key, aad, plaintext)
    return f"{body['n']}.{body['c']}"


def open_field(key: bytes, aad: bytes, value: str) -> bytes:
    if not value:
        return b""
    nonce, _, ciphertext = value.partition(".")
    if not _:
        raise Owe1Error("malformed field")
    return open_sealed(key, aad, {"n": nonce, "c": ciphertext})


def now_secs() -> int:
    return int(time.time())
