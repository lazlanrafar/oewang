"""`POST /v1/handshake` and `GET /.well-known/oewang-keys`.

Both are plaintext exceptions (docs/api/encryption.md#plaintext-exceptions).
The handshake creates the keys, so it cannot itself be encrypted; it is
signed instead. The same two routes exist on the API, and the steps below
are the server half of the protocol both sides run.
"""

from __future__ import annotations

import os
import secrets

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core import owe1, sessions
from app.core.envelope import envelope, error_response

router = APIRouter()

SESSION_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"


def new_session_id() -> str:
    """`cs_` plus a 24 character collision-resistant id, as on the Rust side.

    A letter first, like CUID2, so the id is safe wherever an identifier
    cannot start with a digit.
    """
    first = secrets.choice("abcdefghijklmnopqrstuvwxyz")
    rest = "".join(secrets.choice(SESSION_ID_ALPHABET) for _ in range(23))
    return f"cs_{first}{rest}"


class HandshakeRequest(BaseModel):
    v: int
    client_public_key: str = Field(min_length=1)
    client_nonce: str = Field(min_length=1)


class HandshakeResponse(BaseModel):
    v: int
    session_id: str
    server_public_key: str
    server_nonce: str
    server_time: int
    expires_at: int
    kid: str
    signature: str


class PublishedKey(BaseModel):
    kid: str
    public_key: str
    algorithm: str = "Ed25519"


@router.get("/.well-known/oewang-keys", response_model=list[PublishedKey])
async def well_known_keys(request: Request) -> list[PublishedKey]:
    """The pinned public keys. Plaintext and unauthenticated by design: a
    client needs them before it can do anything else."""
    signer = request.app.state.signer
    return [PublishedKey(kid=signer.key_id, public_key=owe1.b64(signer.public_key()))]


@router.post("/v1/handshake")
async def handshake(body: HandshakeRequest, request: Request) -> JSONResponse:
    request_id = request.headers.get("x-owe-request-id", "")

    if body.v != owe1.VERSION:
        return error_response(
            "CRYPTO_VERSION_UNSUPPORTED", f"unsupported version {body.v}", request_id
        )

    try:
        client_public = owe1.unb64(body.client_public_key)
        client_nonce = owe1.unb64(body.client_nonce)
    except owe1.Owe1Error:
        return error_response("CRYPTO_DECRYPT_FAILED", "malformed handshake", request_id)

    if len(client_public) != 32 or len(client_nonce) != 16:
        return error_response("CRYPTO_DECRYPT_FAILED", "malformed handshake", request_id)

    # Ephemeral on this side too, so a leak of the signing key does not
    # retroactively expose past sessions.
    server_secret = X25519PrivateKey.generate()
    server_public = server_secret.public_key().public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
    )
    server_nonce = os.urandom(16)
    session_id = new_session_id()

    try:
        # Rejects a low-order point: accepting one would mean deriving a key
        # the attacker already knows.
        keys = owe1.derive_keys(
            server_secret, client_public, client_nonce, server_nonce, session_id
        )
    except owe1.Owe1Error:
        return error_response("CRYPTO_DECRYPT_FAILED", "malformed handshake", request_id)

    server_time = sessions.now_secs()
    expires_at = server_time + sessions.SESSION_TTL_SECS

    signer = request.app.state.signer
    signature = signer.sign(
        owe1.transcript(
            client_public,
            server_public,
            client_nonce,
            server_nonce,
            session_id,
            expires_at,
            server_time,
        )
    )

    request.app.state.owe1_sessions.insert(session_id, keys, expires_at)

    # The ephemeral private key is dropped here and never stored.
    return JSONResponse(
        HandshakeResponse(
            v=owe1.VERSION,
            session_id=session_id,
            server_public_key=owe1.b64(server_public),
            server_nonce=owe1.b64(server_nonce),
            server_time=server_time,
            expires_at=expires_at,
            kid=signer.key_id,
            signature=owe1.b64(signature),
        ).model_dump()
    )


class SessionStatus(BaseModel):
    session_id: str
    expires_at: int
    server_time: int


@router.get("/v1/session")
async def session_status(request: Request) -> dict:
    """Report the caller's own crypto session.

    The first protected route: reaching it at all proves the caller holds
    live session keys, so the API's client can check a session before
    committing to a real call. It carries no workspace data.

    Protected routes answer in the envelope, like the API's, because one
    client parses both services (docs/api/conventions.md). The handshake
    above does not: it is the one route that exists before a session, and
    its shape is fixed by the protocol.
    """
    session_id = request.headers.get("x-owe-session", "")
    now = sessions.now_secs()
    status = SessionStatus(
        session_id=session_id,
        expires_at=request.app.state.owe1_sessions.expires_at(session_id) or now,
        server_time=now,
    )
    return envelope(status.model_dump(), request.headers.get("x-owe-request-id", ""))
