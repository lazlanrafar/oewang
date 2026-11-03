"""The client half of OWE1: this service calling back into the API.

`app/core/middleware.py` is the server half, which opens what the API sends
here. This is the other direction, hop 3 reversed: the AI service performs
every side effect by calling the API (D4), and every body on that hop is
sealed (D22).

The reference implementation is `apps/api/crates/clients/src/owe1_client.rs`
and this matches its behaviour deliberately, because a protocol with three
implementations drifts unless each one is written against the others:

- One crypto session per process, re-handshaken a minute before it expires.
- The handshake signature is verified against a pinned key. A client that
  cannot verify stops; it never falls back to plaintext.
- Exactly one retry on `CRYPTO_SESSION_UNKNOWN`, which is what a restart of
  the API looks like from here, and exactly one on a transport error. A
  refusal is never retried: retrying it only spends money twice.
- A body that is not sealed is accepted only when it carries an error, which
  is the one case the protocol allows in plaintext because the caller may
  hold no working key. A plaintext answer carrying data is refused.

No new cryptography: every primitive comes from `app/core/owe1.py`, which is
pinned by the shared vectors.
"""

from __future__ import annotations

import asyncio
import json
import os
import secrets
from dataclasses import dataclass
from typing import Any

import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey

from app.core import owe1

HANDSHAKE_PATH = "/v1/handshake"
WELL_KNOWN_PATH = "/.well-known/oewang-keys"

#: Re-handshake this long before the session actually expires, so a call does
#: not start with a session that dies mid-flight.
EXPIRY_MARGIN_SECS = 60
RETRY_DELAY_SECS = 0.25

_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"


def new_request_id() -> str:
    """`req_` plus a collision-resistant id, as `handshake::new_request_id`
    produces on the Rust side. A letter first, like CUID2."""
    first = secrets.choice("abcdefghijklmnopqrstuvwxyz")
    rest = "".join(secrets.choice(_ID_ALPHABET) for _ in range(23))
    return f"req_{first}{rest}"


class ClientError(Exception):
    """Any failure to reach the API or read its answer."""

    code = "API_UNAVAILABLE"


class TransportError(ClientError):
    """The API could not be reached. Retried once, then reported."""


class MalformedError(ClientError):
    """The API answered something this client cannot read."""


class HandshakeError(ClientError):
    """No pinned key, an unknown key id, or a signature that did not verify.

    Never a reason to fall back to plaintext
    (docs/api/encryption.md#handshake).
    """


class ApiError(ClientError):
    """An error envelope from the API, relayed rather than retried."""

    def __init__(
        self,
        code: str,
        message: str,
        hint: str | None = None,
        fields: dict[str, str] | None = None,
    ) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.hint = hint
        self.fields = fields or {}


def parse_pinned_keys(raw: str) -> dict[str, bytes]:
    """`kid:base64url,kid:base64url` from configuration, as the Rust
    `parse_pinned_keys` reads the same variable."""
    pinned: dict[str, bytes] = {}
    for pair in raw.split(","):
        entry = pair.strip()
        if not entry:
            continue
        kid, separator, value = entry.partition(":")
        if not separator:
            raise HandshakeError(f"{kid.strip()} is not kid:key")
        try:
            key = owe1.unb64(value.strip())
        except owe1.Owe1Error as exc:
            raise HandshakeError(f"the key for {kid.strip()} is not base64url") from exc
        if len(key) != 32:
            raise HandshakeError(f"the key for {kid.strip()} is not 32 bytes")
        pinned[kid.strip()] = key
    return pinned


@dataclass(frozen=True)
class Session:
    id: str
    keys: owe1.SessionKeys
    expires_at: int

    def __repr__(self) -> str:  # keys never print (OPS-3)
        return f"Session(id={self.id!r}, expires_at={self.expires_at})"


class Owe1Client:
    """One crypto session, held for the life of the process."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        pinned: dict[str, bytes] | None = None,
        discover_keys: bool = False,
        timeout: float = 30.0,
        enabled: bool = True,
        http: httpx.AsyncClient | None = None,
    ) -> None:
        pinned = dict(pinned or {})
        if enabled and not pinned and not discover_keys:
            # Refuse at construction rather than at the first tool call: a
            # client that cannot verify a handshake can never run one.
            raise HandshakeError("signing keys are required but none are configured")

        self.base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._pinned = pinned
        self._discover_keys = discover_keys
        self._enabled = enabled
        self._http = http or httpx.AsyncClient(timeout=timeout)
        self._session: Session | None = None
        self._lock = asyncio.Lock()

    def __repr__(self) -> str:  # neither key prints (OPS-3)
        return f"Owe1Client(base_url={self.base_url!r})"

    async def aclose(self) -> None:
        await self._http.aclose()

    async def get(self, path: str, query: str = "") -> Any:
        return await self._call("GET", path, query, None)

    async def post(self, path: str, body: Any) -> Any:
        return await self._call("POST", path, "", body)

    # ------------------------------------------------------------- calling

    async def _call(self, method: str, path: str, query: str, body: Any) -> Any:
        retried_session = False
        retried_transport = False

        while True:
            session = await self._session_for()
            try:
                return await self._send(session, method, path, query, body)
            except ApiError as error:
                # What a restart of the other side looks like from here.
                if error.code == "CRYPTO_SESSION_UNKNOWN" and not retried_session:
                    retried_session = True
                    await self._forget(session)
                    continue
                # Every other refusal is reported. Retrying one changes
                # nothing and spends the turn twice.
                raise
            except TransportError:
                if retried_transport:
                    raise
                retried_transport = True
                await asyncio.sleep(RETRY_DELAY_SECS)

    async def _send(
        self,
        session: Session | None,
        method: str,
        path: str,
        query: str,
        body: Any,
    ) -> Any:
        request_id = new_request_id()
        timestamp = owe1.now_secs()
        plaintext = None if body is None else json.dumps(body).encode()

        headers = {"x-api-key": self._api_key}
        content: bytes | None = None

        if session is None:
            # Plaintext mode, which only development allows: the API's own
            # middleware is off too, so there is nothing to seal against.
            headers["content-type"] = "application/json"
            content = plaintext
        else:
            keys = session.keys
            headers.update(
                {
                    "content-type": owe1.CONTENT_TYPE,
                    "x-owe-session": session.id,
                    "x-owe-request-id": request_id,
                    "x-owe-timestamp": str(timestamp),
                    # Required even when empty, so a stripped filter cannot
                    # pass unnoticed.
                    "x-owe-query": owe1.seal_field(
                        keys.client_to_server,
                        owe1.aad_query(session.id, method, path, request_id, timestamp),
                        query.encode(),
                    ),
                }
            )
            if plaintext is not None:
                content = json.dumps(
                    owe1.seal(
                        keys.client_to_server,
                        owe1.aad_request(session.id, method, path, request_id, timestamp),
                        plaintext,
                    )
                ).encode()

        try:
            # The path carries no query string: it travels in the header.
            response = await self._http.request(
                method, f"{self.base_url}{path}", headers=headers, content=content
            )
        except httpx.HTTPError as exc:
            # The type, never the message: a client error can quote the
            # request back (OPS-3).
            raise TransportError(type(exc).__name__) from exc

        return self._read_envelope(session, request_id, response)

    def _read_envelope(
        self, session: Session | None, request_id: str, response: httpx.Response
    ) -> Any:
        raw = response.content
        if not raw:
            raise MalformedError(f"the API answered status {response.status_code} with no body")

        plaintext = raw
        sealed = _as_sealed_body(raw)

        if session is not None and sealed is not None:
            try:
                plaintext = owe1.open_sealed(
                    session.keys.server_to_client,
                    owe1.aad_response(session.id, request_id, response.status_code),
                    sealed,
                )
            except owe1.Owe1Error as exc:
                raise MalformedError("the response did not open") from exc

        try:
            envelope = json.loads(plaintext)
        except ValueError as exc:
            raise MalformedError(
                f"the API answered something this client cannot read "
                f"(status {response.status_code})"
            ) from exc

        if not isinstance(envelope, dict):
            raise MalformedError("the API answered outside the envelope")

        error = envelope.get("error")
        if error:
            raise ApiError(
                code=str(error.get("code", "")),
                message=str(error.get("message", "")),
                hint=error.get("hint"),
                fields=error.get("fields"),
            )

        if session is not None and sealed is None:
            # Fail closed. A plaintext body on a sealed hop is allowed only
            # for an error the caller may hold no key for, and that case was
            # answered above (docs/api/encryption.md#errors).
            raise MalformedError("the API answered in plaintext on a sealed hop")

        if "data" not in envelope:
            raise MalformedError("no data in the envelope")
        return envelope["data"]

    # ------------------------------------------------------------ sessions

    async def _session_for(self) -> Session | None:
        if not self._enabled:
            return None

        session = self._session
        if session is not None and session.expires_at > owe1.now_secs() + EXPIRY_MARGIN_SECS:
            return session

        # One handshake at a time, however many calls arrive at once.
        async with self._lock:
            session = self._session
            if session is not None and session.expires_at > owe1.now_secs() + EXPIRY_MARGIN_SECS:
                return session
            self._session = await self._handshake()
            return self._session

    async def _forget(self, session: Session | None) -> None:
        async with self._lock:
            held = self._session
            if session is not None and held is not None and held.id == session.id:
                self._session = None

    async def _handshake(self) -> Session:
        private = X25519PrivateKey.generate()
        public = private.public_key().public_bytes(
            encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
        )
        client_nonce = os.urandom(16)

        try:
            response = await self._http.post(
                f"{self.base_url}{HANDSHAKE_PATH}",
                headers={"x-api-key": self._api_key},
                json={
                    "v": owe1.VERSION,
                    "client_public_key": owe1.b64(public),
                    "client_nonce": owe1.b64(client_nonce),
                },
            )
        except httpx.HTTPError as exc:
            raise TransportError(type(exc).__name__) from exc

        if response.status_code >= 400:
            raise ApiError(
                "API_UNAVAILABLE", f"the handshake failed with status {response.status_code}"
            )

        try:
            body = response.json()
            session_id = str(body["session_id"])
            server_public = owe1.unb64(body["server_public_key"])
            server_nonce = owe1.unb64(body["server_nonce"])
            signature = owe1.unb64(body["signature"])
            expires_at = int(body["expires_at"])
            server_time = int(body["server_time"])
            kid = str(body["kid"])
        except (ValueError, KeyError, TypeError, owe1.Owe1Error) as exc:
            raise MalformedError("the handshake answer could not be read") from exc

        if len(server_public) != 32 or len(server_nonce) != 16 or len(signature) != 64:
            raise MalformedError("the handshake answer is malformed")

        pinned = await self._signing_key(kid)

        try:
            # Verify or stop. Never fall back to plaintext.
            owe1.verify_handshake(
                pinned,
                signature,
                owe1.transcript(
                    public,
                    server_public,
                    client_nonce,
                    server_nonce,
                    session_id,
                    expires_at,
                    server_time,
                ),
            )
            keys = owe1.derive_keys(private, server_public, client_nonce, server_nonce, session_id)
        except owe1.Owe1Error as exc:
            raise HandshakeError(str(exc)) from exc

        # The ephemeral private key goes out of scope here and is never
        # stored, which is what forward secrecy rests on.
        return Session(id=session_id, keys=keys, expires_at=expires_at)

    async def _signing_key(self, kid: str) -> bytes:
        key = self._pinned.get(kid)
        if key is not None:
            return key

        if not self._discover_keys:
            raise HandshakeError(f"no pinned signing key for {kid}")

        # Development only, and cached, so the published set is read once.
        try:
            response = await self._http.get(f"{self.base_url}{WELL_KNOWN_PATH}")
            published = response.json()
        except httpx.HTTPError as exc:
            raise TransportError(type(exc).__name__) from exc
        except ValueError as exc:
            raise MalformedError("the published keys could not be read") from exc

        for entry in published if isinstance(published, list) else []:
            try:
                value = owe1.unb64(entry["public_key"])
            except (owe1.Owe1Error, KeyError, TypeError):
                continue
            if len(value) == 32:
                self._pinned[str(entry["kid"])] = value

        key = self._pinned.get(kid)
        if key is None:
            raise HandshakeError(f"no pinned signing key for {kid}")
        return key


def _as_sealed_body(raw: bytes) -> dict[str, str] | None:
    """`{"n": …, "c": …}`, or `None` for anything else."""
    try:
        body = json.loads(raw)
    except ValueError:
        return None
    if isinstance(body, dict) and set(body) == {"n", "c"}:
        return body
    return None


def build_api_client(config: Any) -> Owe1Client:
    """The client this service calls the API with.

    Development reads the key the local API publishes, exactly as the Rust
    client does in development mode. Anywhere else the pin is required, and
    `Settings.validate_for_environment` has already refused to start without
    it.
    """
    return Owe1Client(
        base_url=config.api_internal_url,
        api_key=config.ai_service_api_key,
        pinned=parse_pinned_keys(config.crypto_signing_public_keys),
        discover_keys=config.app_env == "development",
        timeout=config.api_timeout_secs,
        enabled=config.owe1_enabled,
    )
