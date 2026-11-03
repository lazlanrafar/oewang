"""The three layers every request passes, outermost first.

1. `ServiceKeyMiddleware` - the shared key between the API and this service
   (D4, SEC-1). There is no user authentication here; this process never
   holds a user JWT.
2. `RateLimitMiddleware` - a ceiling per caller, so a loop in the API cannot
   become an unbounded spend on the model.
3. `Owe1Middleware` - open the request, seal the response. The same contract
   as the Rust middleware at apps/api/crates/server/src/owe1/middleware.rs
   and the Node client at apps/app/src/lib/server/api.ts, pinned by the
   shared vectors.

They are plain ASGI middlewares rather than `BaseHTTPMiddleware` because the
OWE1 layer has to replace the request body and the response body, and only
the ASGI interface gives both without buffering a stream it should not
touch.
"""

from __future__ import annotations

import hmac
import json
from collections.abc import Awaitable, Callable, Iterable

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core import owe1, sessions
from app.core.envelope import TRANSPORT_ERROR_HEADER, error_response
from app.core.ratelimit import RateLimiter

CONTENT_TYPE = owe1.CONTENT_TYPE

HEADER_SESSION = b"x-owe-session"
HEADER_REQUEST_ID = b"x-owe-request-id"
HEADER_TIMESTAMP = b"x-owe-timestamp"
HEADER_QUERY = b"x-owe-query"
HEADER_API_KEY = b"x-api-key"

#: Reachable without the service key: liveness, and the public keys a client
#: needs before it can do anything else.
OPEN_PATHS = frozenset({"/health", "/.well-known/oewang-keys"})

#: Reachable without an OWE1 session. The handshake creates the keys, so it
#: cannot itself be encrypted; it is signed instead
#: (docs/api/encryption.md#handshake).
PLAINTEXT_PATHS = OPEN_PATHS | {"/v1/handshake"}


def header(scope: Scope, name: bytes) -> str:
    for key, value in scope.get("headers", []):
        if key == name:
            return value.decode("latin-1")
    return ""


def _replace_headers(scope: Scope, changes: dict[bytes, bytes | None]) -> None:
    kept = [(k, v) for k, v in scope["headers"] if k not in changes]
    kept.extend((name, value) for name, value in changes.items() if value is not None)
    scope["headers"] = kept


async def _read_body(receive: Receive) -> bytes:
    body = b""
    while True:
        message = await receive()
        if message["type"] != "http.request":
            break
        body += message.get("body", b"")
        if not message.get("more_body", False):
            break
    return body


def _replay(body: bytes) -> Receive:
    """A receive channel that hands over one body and then nothing more."""
    sent = False

    async def receive() -> Message:
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return receive


class ServiceKeyMiddleware:
    """Every route but the open ones requires `x-api-key` (D4).

    Compared in constant time: a comparison that returns early leaks the
    shared key one byte at a time to anyone who can measure it.
    """

    def __init__(self, app: ASGIApp, *, api_key: str, open_paths: Iterable[str] = OPEN_PATHS):
        self.app = app
        self.api_key = api_key
        self.open_paths = frozenset(open_paths)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] in self.open_paths:
            return await self.app(scope, receive, send)

        offered = header(scope, HEADER_API_KEY)
        if not hmac.compare_digest(offered, self.api_key):
            response = error_response(
                "UNAUTHORIZED",
                "a valid x-api-key is required",
                header(scope, HEADER_REQUEST_ID),
            )
            return await response(scope, receive, send)

        return await self.app(scope, receive, send)


class RateLimitMiddleware:
    """A ceiling per caller. The handshake has its own, lower one, because it
    is the only unauthenticated-by-session route that does real work
    (docs/api/encryption.md#handshake)."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        limiter: RateLimiter,
        handshake_limiter: RateLimiter,
        open_paths: Iterable[str] = OPEN_PATHS,
    ):
        self.app = app
        self.limiter = limiter
        self.handshake_limiter = handshake_limiter
        self.open_paths = frozenset(open_paths)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] in self.open_paths:
            return await self.app(scope, receive, send)

        caller = scope["client"][0] if scope.get("client") else "unknown"
        limiter = self.handshake_limiter if scope["path"] == "/v1/handshake" else self.limiter

        if not limiter.allow(caller):
            response = error_response(
                "RATE_LIMITED",
                "too many requests",
                header(scope, HEADER_REQUEST_ID),
                retry_after=limiter.retry_after(caller),
            )
            response.headers["retry-after"] = str(limiter.retry_after(caller))
            return await response(scope, receive, send)

        return await self.app(scope, receive, send)


class Owe1Middleware:
    """Open the request, seal the response.

    The plaintext exceptions are a path set rather than a prefix match, so
    the exception list cannot drift from the documentation
    (docs/api/encryption.md#plaintext-exceptions).
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        store: sessions.SessionStore,
        enabled: bool = True,
        plaintext_paths: Iterable[str] = PLAINTEXT_PATHS,
    ):
        self.app = app
        self.store = store
        self.enabled = enabled
        self.plaintext_paths = frozenset(plaintext_paths)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or not self.enabled
            or scope["path"] in self.plaintext_paths
        ):
            return await self.app(scope, receive, send)

        request_id = header(scope, HEADER_REQUEST_ID)

        async def refuse(code: str, message: str, **extra: object) -> None:
            await error_response(code, message, request_id, **extra)(scope, receive, send)

        session_id = header(scope, HEADER_SESSION)
        if not session_id:
            return await refuse("CRYPTO_SESSION_UNKNOWN", "no crypto session")
        if not request_id:
            return await refuse("CRYPTO_DECRYPT_FAILED", "no request id")

        try:
            timestamp = int(header(scope, HEADER_TIMESTAMP))
        except ValueError:
            return await refuse("CRYPTO_DECRYPT_FAILED", "no timestamp")

        now = sessions.now_secs()
        if not sessions.timestamp_acceptable(timestamp, now):
            # The server's own time travels in the error so the client can
            # correct its offset and retry once.
            return await refuse(
                "CRYPTO_CLOCK_SKEW", "timestamp outside the window", server_time=now
            )

        keys = self.store.keys(session_id, now)
        if keys is None:
            return await refuse("CRYPTO_SESSION_UNKNOWN", "unknown crypto session")

        # Freshness came from the timestamp above; this catches a replay
        # inside the window, which the timestamp alone cannot.
        outcome = self.store.observe(session_id, request_id, now)
        if outcome is None:
            return await refuse("CRYPTO_SESSION_UNKNOWN", "unknown crypto session")
        if outcome is sessions.SeenOutcome.REPLAY:
            return await refuse("CRYPTO_REPLAY_DETECTED", "request id already used")

        method = scope["method"]
        path = scope["path"]

        # A plaintext query string on a protected route is refused rather
        # than ignored, so a stripped filter cannot pass unnoticed.
        if scope.get("query_string"):
            return await refuse("CRYPTO_QUERY_NOT_ENCRYPTED", "the query string must be encrypted")

        sealed_query = header(scope, HEADER_QUERY)
        if not sealed_query:
            return await refuse("CRYPTO_QUERY_NOT_ENCRYPTED", "the query header is required")

        try:
            query = owe1.open_field(
                keys.client_to_server,
                owe1.aad_query(session_id, method, path, request_id, timestamp),
                sealed_query,
            )
        except owe1.Owe1Error:
            return await refuse("CRYPTO_DECRYPT_FAILED", "the query could not be opened")

        sealed_body = await _read_body(receive)
        plaintext = b""
        if sealed_body:
            try:
                plaintext = owe1.open_sealed(
                    keys.client_to_server,
                    owe1.aad_request(session_id, method, path, request_id, timestamp),
                    json.loads(sealed_body),
                )
            except (owe1.Owe1Error, ValueError, KeyError, TypeError):
                return await refuse("CRYPTO_DECRYPT_FAILED", "the body could not be opened")

        inner = dict(scope)
        inner["query_string"] = query
        inner["headers"] = list(scope["headers"])
        # Routes that parse JSON need the plain content type, not ours.
        _replace_headers(
            inner,
            {
                b"content-type": b"application/json",
                b"content-length": str(len(plaintext)).encode(),
            },
        )
        # A streaming route seals its own events, so it needs the keys
        # (docs/api/encryption.md#chat-stream-events).
        inner["owe1"] = {
            "session_id": session_id,
            "request_id": request_id,
            "keys": keys,
        }

        await self.app(inner, _replay(plaintext), _sealing_send(send, keys, session_id, request_id))


def _sealing_send(
    send: Send,
    keys: owe1.SessionKeys,
    session_id: str,
    request_id: str,
) -> Callable[[Message], Awaitable[None]]:
    """Buffer the response and seal it, binding the status so a proxy cannot
    turn a 403 into a 200 or move one body onto another request.

    Two bodies pass through untouched: a transport error, because the caller
    may hold no working key, and an event stream, whose events are sealed
    one by one by the route that writes them.
    """
    state: dict[str, object] = {"start": None, "passthrough": False, "body": b""}

    async def sealing_send(message: Message) -> None:
        if message["type"] == "http.response.start":
            headers = message.get("headers", [])
            status = message["status"]
            transport_error = 400 <= status < 500 and any(
                key == TRANSPORT_ERROR_HEADER.encode() for key, _ in headers
            )
            streaming = any(
                key == b"content-type" and value.startswith(b"text/event-stream")
                for key, value in headers
            )
            if transport_error or streaming:
                state["passthrough"] = True
                return await send(message)

            state["start"] = message
            return

        if message["type"] != "http.response.body":
            return await send(message)

        if state["passthrough"]:
            return await send(message)

        state["body"] = state["body"] + message.get("body", b"")
        if message.get("more_body", False):
            return

        start: Message = state["start"]  # type: ignore[assignment]
        sealed = owe1.seal(
            keys.server_to_client,
            owe1.aad_response(session_id, request_id, start["status"]),
            state["body"],  # type: ignore[arg-type]
        )
        payload = json.dumps(sealed).encode()

        headers = [
            (key, value)
            for key, value in start.get("headers", [])
            if key not in (b"content-type", b"content-length", b"cache-control")
        ]
        headers.append((b"content-type", CONTENT_TYPE.encode()))
        headers.append((b"content-length", str(len(payload)).encode()))
        # Nothing encrypted is cacheable, and every protected route is
        # dynamic anyway.
        headers.append((b"cache-control", b"no-store"))

        await send({**start, "headers": headers})
        await send({"type": "http.response.body", "body": payload, "more_body": False})

    return sealing_send
