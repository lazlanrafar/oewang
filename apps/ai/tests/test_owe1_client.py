"""The client half of OWE1, driven against this service's own server half.

The AI service already implements the server side of the protocol, so the
client is tested against it rather than against a mock: a handshake it
verifies, a body it seals, a response it opens. A mock would agree with
whatever the client did, which is the one thing worth not assuming.

The route the tests post to stands in for the API's
`/v1/internal/tools/execute`. It is mounted on this app, so it travels
through the same middleware and proves the whole path.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.config import Settings
from app.core import owe1
from app.core.envelope import envelope, error_response
from app.core.owe1_client import (
    ApiError,
    HandshakeError,
    MalformedError,
    Owe1Client,
    TransportError,
    build_api_client,
    new_request_id,
    parse_pinned_keys,
)
from app.main import create_app

ECHO_PATH = "/v1/internal/tools/execute"


class RecordingTransport(httpx.AsyncBaseTransport):
    """An ASGI transport that keeps every request, and can be told to fail.

    `fail_paths` raises a transport error the first time each path is asked
    for, which is what a container restarting under us looks like.
    """

    def __init__(self, app: Any, fail_once: set[str] | None = None) -> None:
        self._inner = httpx.ASGITransport(app=app)
        self.requests: list[httpx.Request] = []
        self.bodies: list[bytes] = []
        self._fail_once = set(fail_once or ())

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        self.bodies.append(request.content)
        if request.url.path in self._fail_once:
            self._fail_once.discard(request.url.path)
            raise httpx.ConnectError("connection refused", request=request)
        return await self._inner.handle_async_request(request)

    def paths(self) -> list[str]:
        return [request.url.path for request in self.requests]


@pytest.fixture
def server(config: Settings) -> FastAPI:
    """The service, plus one route standing in for the API's."""
    instance = create_app(config)

    @instance.post(ECHO_PATH)
    async def execute(request: Request) -> Any:
        body = json.loads(await request.body())
        request_id = request.headers.get("x-owe-request-id", "")
        instance.state.seen.append(body)
        if instance.state.refuse is not None:
            code, message = instance.state.refuse
            return error_response(code, message, request_id)
        return envelope(
            {"ok": True, "result": {"echo": body["tool"]}, "summary": "one row"}, request_id
        )

    instance.state.seen = []
    instance.state.refuse = None
    return instance


def client_for(
    server: FastAPI, config: Settings, transport: RecordingTransport, **overrides: Any
) -> Owe1Client:
    options: dict[str, Any] = {
        "base_url": "http://api.test",
        "api_key": config.ai_service_api_key,
        "pinned": {},
        "discover_keys": True,
        "http": httpx.AsyncClient(transport=transport),
    }
    options.update(overrides)
    return Owe1Client(**options)


def call_body() -> dict[str, Any]:
    return {
        "workspace_id": "clxworkspace1",
        "user_id": "clxuser1",
        "role": "admin",
        "session_id": "clxsession1",
        "turn_id": "clxturn1",
        "tool": "get_recent_transactions",
        "args": {"limit": 5},
    }


# ------------------------------------------------------------- round trip


async def test_a_sealed_body_goes_out_and_the_answer_opens(
    server: FastAPI, config: Settings
) -> None:
    transport = RecordingTransport(server)
    client = client_for(server, config, transport)

    data = await client.post(ECHO_PATH, call_body())

    assert data == {"ok": True, "result": {"echo": "get_recent_transactions"}, "summary": "one row"}
    assert server.state.seen == [call_body()]
    # Handshake, the published key it was signed with, then the call.
    assert transport.paths() == ["/v1/handshake", "/.well-known/oewang-keys", ECHO_PATH]


async def test_the_body_is_not_readable_on_the_wire(server: FastAPI, config: Settings) -> None:
    transport = RecordingTransport(server)
    client = client_for(server, config, transport)

    await client.post(ECHO_PATH, call_body())

    sent = transport.bodies[-1]
    assert b"get_recent_transactions" not in sent
    assert b"clxworkspace1" not in sent
    assert set(json.loads(sent)) == {"n", "c"}


async def test_every_request_carries_a_sealed_query_even_with_no_query(
    server: FastAPI, config: Settings
) -> None:
    """Required even when empty, so a stripped filter cannot pass
    unnoticed (docs/api/encryption.md#query-strings)."""
    transport = RecordingTransport(server)
    client = client_for(server, config, transport)

    await client.post(ECHO_PATH, call_body())

    request = transport.requests[-1]
    assert request.headers["x-owe-query"]
    assert request.headers["x-owe-session"].startswith("cs_")
    assert request.headers["x-owe-request-id"].startswith("req_")
    assert request.headers["content-type"] == owe1.CONTENT_TYPE
    assert request.url.query == b""


async def test_one_handshake_serves_every_later_call(
    server: FastAPI, config: Settings
) -> None:
    transport = RecordingTransport(server)
    client = client_for(server, config, transport)

    await client.post(ECHO_PATH, call_body())
    await client.post(ECHO_PATH, call_body())
    await client.post(ECHO_PATH, call_body())

    assert transport.paths().count("/v1/handshake") == 1
    assert transport.paths().count(ECHO_PATH) == 3


# ----------------------------------------------------------- the retries


async def test_an_unknown_session_is_retried_once_after_a_new_handshake(
    server: FastAPI, config: Settings
) -> None:
    """What a restart of the other side looks like from here."""
    transport = RecordingTransport(server)
    client = client_for(server, config, transport)

    await client.post(ECHO_PATH, call_body())
    # The API forgetting every session is exactly what a restart does.
    server.state.owe1_sessions.sweep(owe1.now_secs() + 10**6)

    data = await client.post(ECHO_PATH, call_body())

    assert data["ok"] is True
    assert transport.paths().count("/v1/handshake") == 2
    # The refused call, then the one that worked.
    assert transport.paths().count(ECHO_PATH) == 3


async def test_a_transport_failure_is_retried_once(server: FastAPI, config: Settings) -> None:
    transport = RecordingTransport(server, fail_once={ECHO_PATH})
    client = client_for(server, config, transport)

    data = await client.post(ECHO_PATH, call_body())

    assert data["ok"] is True
    assert transport.paths().count(ECHO_PATH) == 2


async def test_a_second_transport_failure_is_reported(server: FastAPI, config: Settings) -> None:
    class AlwaysFails(RecordingTransport):
        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            if request.url.path == ECHO_PATH:
                self.requests.append(request)
                raise httpx.ConnectError("connection refused", request=request)
            return await super().handle_async_request(request)

    failing = AlwaysFails(server)
    client = client_for(server, config, failing)

    with pytest.raises(TransportError):
        await client.post(ECHO_PATH, call_body())

    assert failing.paths().count(ECHO_PATH) == 2


async def test_a_refusal_is_not_retried(server: FastAPI, config: Settings) -> None:
    """Retrying a refusal changes nothing and spends the turn twice."""
    transport = RecordingTransport(server)
    client = client_for(server, config, transport)
    server.state.refuse = ("TOOL_FORBIDDEN", "a member may not write")

    with pytest.raises(ApiError) as raised:
        await client.post(ECHO_PATH, call_body())

    assert raised.value.code == "TOOL_FORBIDDEN"
    assert raised.value.message == "a member may not write"
    assert transport.paths().count(ECHO_PATH) == 1


# --------------------------------------------------------------- pinning


async def test_a_handshake_signed_by_an_unpinned_key_is_refused(
    server: FastAPI, config: Settings
) -> None:
    """Verify or stop. Never fall back to plaintext."""
    transport = RecordingTransport(server)
    client = client_for(
        server,
        config,
        transport,
        pinned={"k-somethingelse": bytes(32)},
        discover_keys=False,
    )

    with pytest.raises(HandshakeError, match="no pinned signing key"):
        await client.post(ECHO_PATH, call_body())

    assert ECHO_PATH not in transport.paths()


async def test_a_signature_that_does_not_verify_stops_the_client(
    server: FastAPI, config: Settings
) -> None:
    transport = RecordingTransport(server)
    # The right key id pinned to the wrong key: what a rotated signer or a
    # substituted server looks like.
    kid = server.state.signer.key_id
    other = Ed25519PrivateKey.generate().public_key().public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
    )
    client = client_for(server, config, transport, pinned={kid: other}, discover_keys=False)

    with pytest.raises(HandshakeError):
        await client.post(ECHO_PATH, call_body())

    assert ECHO_PATH not in transport.paths()


def test_a_client_with_no_pinned_key_and_no_discovery_refuses_to_be_built() -> None:
    with pytest.raises(HandshakeError, match="none are configured"):
        Owe1Client(base_url="http://api.test", api_key="k", pinned={}, discover_keys=False)


def test_pinned_keys_are_read_from_configuration() -> None:
    first, second = bytes(range(32)), bytes(range(32, 64))
    raw = f"k-one:{owe1.b64(first)}, k-two:{owe1.b64(second)}"

    assert parse_pinned_keys(raw) == {"k-one": first, "k-two": second}
    assert parse_pinned_keys("") == {}

    with pytest.raises(HandshakeError):
        parse_pinned_keys("k-one")
    with pytest.raises(HandshakeError, match="not 32 bytes"):
        parse_pinned_keys(f"k-one:{owe1.b64(b'short')}")


def test_the_configured_client_discovers_keys_only_in_development(tmp_path) -> None:
    development = Settings(
        app_env="development",
        crypto_signing_key_file=tmp_path / "k.pem",
        api_internal_url="http://api:3002/",
    )
    assert build_api_client(development).base_url == "http://api:3002"

    production = Settings(
        app_env="production",
        ai_service_api_key="a" * 32,
        ai_api_key="set",
        crypto_signing_public_keys="",
        crypto_signing_key_file=tmp_path / "k.pem",
    )
    # The pin is required before the process starts, so a client that could
    # not verify never gets built in the first place.
    with pytest.raises(ValueError, match="CRYPTO_SIGNING_PUBLIC_KEYS"):
        production.validate_for_environment()
    with pytest.raises(HandshakeError):
        build_api_client(production)


# ----------------------------------------------------------- failing closed


async def test_a_plaintext_answer_carrying_data_is_refused(
    server: FastAPI, config: Settings
) -> None:
    """A body that is not sealed is only ever a CRYPTO_* error the caller
    may hold no key for. One carrying data means the hop is not protected,
    which is not something to carry on through."""

    class Unseals(RecordingTransport):
        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            response = await super().handle_async_request(request)
            if request.url.path != ECHO_PATH:
                return response
            body = json.dumps({"data": {"ok": True}, "error": None, "meta": {}}).encode()
            return httpx.Response(200, content=body, headers={"content-type": "application/json"})

    client = client_for(server, config, Unseals(server))

    with pytest.raises(MalformedError, match="plaintext on a sealed hop"):
        await client.post(ECHO_PATH, call_body())


async def test_an_answer_sealed_for_another_request_does_not_open(
    server: FastAPI, config: Settings
) -> None:
    """The request id and the status are in the associated data, so a body
    moved from one request to another fails the tag check."""

    class Swaps(RecordingTransport):
        held: bytes | None = None

        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            response = await super().handle_async_request(request)
            if request.url.path != ECHO_PATH:
                return response
            await response.aread()
            if self.held is None:
                self.held = response.content
                return httpx.Response(
                    response.status_code, content=self.held, headers=response.headers
                )
            # The same body answering a different request id.
            return httpx.Response(
                200, content=self.held, headers={"content-type": owe1.CONTENT_TYPE}
            )

    transport = Swaps(server)
    client = client_for(server, config, transport)

    await client.post(ECHO_PATH, call_body())
    with pytest.raises(MalformedError, match="did not open"):
        await client.post(ECHO_PATH, call_body())


def test_a_request_id_is_fresh_every_time() -> None:
    ids = {new_request_id() for _ in range(100)}
    assert len(ids) == 100
    assert all(value.startswith("req_") for value in ids)


# ------------------------------------------------------------- plaintext


async def test_plaintext_mode_runs_no_handshake(config: Settings) -> None:
    """Development only, and the API's own middleware is off too, so there
    is nothing to seal against. `validate_for_environment` refuses it
    anywhere else."""
    plaintext_config = config.model_copy(update={"owe1_enabled": False})
    plaintext_server = create_app(plaintext_config)

    @plaintext_server.post(ECHO_PATH)
    async def execute(request: Request) -> Any:
        return envelope({"ok": True, "result": {}, "summary": "plain"}, "")

    transport = RecordingTransport(plaintext_server)
    client = client_for(
        plaintext_server, plaintext_config, transport, enabled=False, discover_keys=False
    )

    data = await client.post(ECHO_PATH, call_body())

    assert data["summary"] == "plain"
    assert "/v1/handshake" not in transport.paths()
    assert json.loads(transport.bodies[-1])["tool"] == "get_recent_transactions"


def test_the_service_key_still_gates_the_hop(server: FastAPI, config: Settings) -> None:
    """The client sends it on every request, including the handshake."""
    with TestClient(server) as http:
        assert http.post(ECHO_PATH, json=call_body()).status_code == 401
