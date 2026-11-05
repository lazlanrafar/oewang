"""`POST /chat/stream`, driven through the real OWE1 client.

The scripted model never reaches a provider: `conftest` resets the client
around every test and each test here installs its own. What these assert is
the contract the API and the browser depend on, which is the event order,
the per-event sealing and the fact that a stream never ends silently.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest

from app.core import model, owe1
from app.core.sse import EventWriter
from app.modules.chat import loop
from app.modules.chat.schemas import ChatStreamRequest
from app.modules.chat.tools import TOOL_NAMES
from tests.support import Owe1TestClient

CHUNKS = ("You spent ", "50,000", " on food.")


class FakeUsage:
    def __init__(self, input_tokens: int, output_tokens: int) -> None:
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class FakeMessage:
    def __init__(self, usage: FakeUsage) -> None:
        self.usage = usage


class ScriptedStream:
    """The slice of the SDK's stream that the route uses: an async context
    manager, a text iterator and the finished message."""

    def __init__(self, chunks: tuple[str, ...], usage: FakeUsage, fail_after: int | None) -> None:
        self._chunks = chunks
        self._usage = usage
        self._fail_after = fail_after
        self.closed = False

    async def __aenter__(self) -> ScriptedStream:
        return self

    async def __aexit__(self, *_: object) -> None:
        self.closed = True

    @property
    def text_stream(self):
        async def generate():
            for index, chunk in enumerate(self._chunks):
                if self._fail_after is not None and index == self._fail_after:
                    raise RuntimeError("the gateway dropped the connection")
                yield chunk

        return generate()

    async def get_final_message(self) -> FakeMessage:
        return FakeMessage(self._usage)


class ScriptedMessages:
    def __init__(self, chunks: tuple[str, ...], usage: FakeUsage, fail_after: int | None) -> None:
        self.calls: list[dict[str, Any]] = []
        self.streams: list[ScriptedStream] = []
        self._chunks = chunks
        self._usage = usage
        self._fail_after = fail_after

    def stream(self, **kwargs: Any) -> ScriptedStream:
        self.calls.append(kwargs)
        self.streams.append(ScriptedStream(self._chunks, self._usage, self._fail_after))
        return self.streams[-1]


class ScriptedClient:
    def __init__(
        self,
        chunks: tuple[str, ...] = CHUNKS,
        usage: tuple[int, int] = (1204, 311),
        fail_after: int | None = None,
    ) -> None:
        self.messages = ScriptedMessages(chunks, FakeUsage(*usage), fail_after)


def payload(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "workspace_id": "clxworkspace1",
        "user_id": "clxuser1",
        "role": "admin",
        "session_id": "clxsession1",
        "turn_id": "clxturn1",
        "message": "How much did I spend on food last month?",
        "history": [],
        "context": {
            "currency_code": "IDR",
            "today": "2026-11-02",
            "timezone": "Asia/Makassar",
            "wallets": [
                {
                    "id": "clxwallet1",
                    "name": "Cash",
                    "balance": "250000.0000",
                    "is_default": True,
                }
            ],
            "categories": [{"id": "clxcat1", "name": "Food", "type": "expense"}],
        },
        "settings": {"custom_instructions": None, "response_language": "auto"},
        "attachments": [],
    }
    body.update(overrides)
    return body


def read_events(
    client: Owe1TestClient, response: Any, request_id: str
) -> list[tuple[str, dict[str, Any]]]:
    """Open every event in order.

    Each one is opened at its own sequence number, so a dropped or reordered
    event fails here rather than being read as text
    (docs/api/encryption.md#chat-stream-events).
    """
    assert client.keys is not None
    blocks = [block for block in response.text.split("\n\n") if block.strip()]

    events = []
    for seq, block in enumerate(blocks):
        name_line, _, data_line = block.partition("\n")
        assert name_line.startswith("event: "), block
        assert data_line.startswith("data: "), block
        plaintext = owe1.open_sealed(
            client.keys.server_to_client,
            owe1.aad_stream_event(client.session_id, request_id, seq),
            json.loads(data_line.removeprefix("data: ")),
        )
        events.append((name_line.removeprefix("event: "), json.loads(plaintext)))
    return events


def stream(client: Owe1TestClient, **overrides: Any):
    response, request_id = client.request("POST", "/chat/stream", body=payload(**overrides))
    return response, request_id


def test_tokens_arrive_as_sealed_events_that_open_in_sequence(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient())

    response, request_id = stream(owe1_client)

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/event-stream")

    events = read_events(owe1_client, response, request_id)
    assert [name for name, _ in events] == ["token", "token", "token", "done"]
    assert "".join(body["text"] for name, body in events if name == "token") == "".join(CHUNKS)


def test_the_reply_is_not_readable_without_the_key(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient())

    response, _ = stream(owe1_client)

    # The event names are plaintext by design; the payloads are not.
    assert "You spent" not in response.text
    assert "50,000" not in response.text


def test_an_event_does_not_open_at_the_wrong_sequence(owe1_client: Owe1TestClient) -> None:
    """The sequence number is what stops two events being swapped."""
    model.set_model_client(ScriptedClient())
    assert owe1_client.keys is not None

    response, request_id = stream(owe1_client)
    first = response.text.split("\n\n")[0].partition("\n")[2].removeprefix("data: ")

    with pytest.raises(owe1.Owe1Error):
        owe1.open_sealed(
            owe1_client.keys.server_to_client,
            owe1.aad_stream_event(owe1_client.session_id, request_id, 1),
            json.loads(first),
        )


def test_done_is_last_and_carries_the_usage(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient(usage=(1204, 311)))

    response, request_id = stream(owe1_client)

    events = read_events(owe1_client, response, request_id)
    name, body = events[-1]
    assert name == "done"
    assert body["usage"]["input"] == 1204
    assert body["usage"]["output"] == 311
    assert body["usage"]["model"], "the model the tokens were spent on"
    # The persisted row's id belongs to the API, which fills it in when it
    # re-seals the event for the next hop.
    assert body["message_id"] is None
    assert "done" not in [n for n, _ in events[:-1]]


def test_a_model_failure_becomes_an_error_event(owe1_client: Owe1TestClient) -> None:
    """A stream never ends silently: the caller is already reading events,
    so a failure has to arrive as one."""
    model.set_model_client(ScriptedClient(fail_after=1))

    response, request_id = stream(owe1_client)

    assert response.status_code == 200
    events = read_events(owe1_client, response, request_id)
    assert [name for name, _ in events] == ["token", "error"]
    assert events[-1][1]["code"] == "MODEL_FAILED"
    # Fixed text: a provider error can quote the request back (OPS-3).
    assert events[-1][1]["message"] == "the model call failed"
    assert "gateway dropped" not in response.text


def test_a_missing_model_key_is_an_error_event_too(
    owe1_client: Owe1TestClient, monkeypatch
) -> None:
    from app.config import settings as process_settings

    monkeypatch.setattr(process_settings, "ai_api_key", "")
    model.set_model_client(None)

    response, request_id = stream(owe1_client)

    events = read_events(owe1_client, response, request_id)
    assert [name for name, _ in events] == ["error"]
    assert events[0][1]["code"] == "MODEL_UNAVAILABLE"


def test_the_catalog_is_attached_and_no_tool_is_forced(owe1_client: Owe1TestClient) -> None:
    """US-030 attaches the fourteen (D17, D88). Nothing forces one: a turn that is
    only a question is answered as a question. The loop itself is covered in
    tests/test_chat_loop.py."""
    client = ScriptedClient()
    model.set_model_client(client)

    stream(owe1_client)

    kwargs = client.messages.calls[0]
    assert [definition["name"] for definition in kwargs["tools"]] == list(TOOL_NAMES)
    assert "tool_choice" not in kwargs


def test_the_prompt_and_the_turn_reach_the_model(owe1_client: Owe1TestClient) -> None:
    client = ScriptedClient()
    model.set_model_client(client)

    stream(
        owe1_client,
        history=[
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ],
    )

    kwargs = client.messages.calls[0]
    assert kwargs["messages"] == [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi"},
        {"role": "user", "content": "How much did I spend on food last month?"},
    ]
    assert "## Capability" in kwargs["system"]
    assert "[id: clxwallet1]" in kwargs["system"]
    assert kwargs["max_tokens"] > 0


def test_history_is_bounded_and_starts_on_a_user_message(owe1_client: Owe1TestClient) -> None:
    """A window sliced out of a long conversation can open on an assistant
    message, which the model rejects."""
    client = ScriptedClient()
    model.set_model_client(client)

    long_history = [
        {"role": "user" if index % 2 == 0 else "assistant", "content": f"m{index}"}
        for index in range(61)
    ]

    stream(owe1_client, history=long_history)

    messages = client.messages.calls[0]["messages"]
    assert len(messages) <= 21
    assert messages[0]["role"] == "user"


def test_attachments_do_not_reach_the_model(owe1_client: Owe1TestClient) -> None:
    """This turn does have tools, which is exactly why an attachment never
    reaches it. The component that reads attacker-controlled text is the one
    with none, and capture is POST /receipt/parse (D24, SEC-21)."""
    client = ScriptedClient()
    model.set_model_client(client)

    stream(
        owe1_client,
        attachments=[
            {
                "vault_file_id": "clxfile1",
                "type": "image/jpeg",
                "url": "https://files.example/receipt.jpg",
            }
        ],
    )

    sent = json.dumps(client.messages.calls[0])
    assert "clxfile1" not in sent
    assert "files.example" not in sent


def test_buffering_is_disabled_on_the_response(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient())

    response, _ = stream(owe1_client)

    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-accel-buffering"] == "no"


def test_a_malformed_body_is_refused_before_the_stream_opens(
    owe1_client: Owe1TestClient,
) -> None:
    """An error before the stream opens is an ordinary sealed response, not
    an event (docs/ai/service.md#streaming-protocol)."""
    model.set_model_client(ScriptedClient())
    body = payload()
    del body["message"]

    response, request_id = owe1_client.request("POST", "/chat/stream", body=body)

    assert response.status_code == 422
    assert not response.headers["content-type"].startswith("text/event-stream")
    # It opens as a normal response body, so the caller reads the reason.
    owe1_client.open_response(response, request_id)


def test_a_turn_without_a_turn_id_is_refused(owe1_client: Owe1TestClient) -> None:
    """The API mints the turn id and the caps are counted against it. A turn
    that arrived without one cannot be given one here: this service inventing
    an id per call would restart the count and walk through the caps."""
    model.set_model_client(ScriptedClient())
    body = payload()
    del body["turn_id"]

    response, request_id = owe1_client.request("POST", "/chat/stream", body=body)

    assert response.status_code == 422
    owe1_client.open_response(response, request_id)


async def test_an_abort_stops_generating_and_emits_nothing_further(config) -> None:
    """The caller hanging up reaches the generator as a cancellation.

    Driven directly rather than over HTTP, because the test client reads a
    response to the end. What matters is that generation stops, the model
    stream is closed, and no half event is written: the API persists the
    prefix it already has (CHAT-9).
    """
    client = ScriptedClient()
    model.set_model_client(client)
    writer = EventWriter(None)

    events = loop.run_turn(
        writer=writer, body=ChatStreamRequest(**payload()), config=config, api=None
    )
    first = await anext(events)
    assert first.startswith(b"event: token")

    with pytest.raises(asyncio.CancelledError):
        await events.athrow(asyncio.CancelledError())

    assert writer.seq == 1, "no event was written after the caller went away"
    assert client.messages.streams[0].closed, "the model stream was closed"


def test_the_route_requires_the_service_key(http) -> None:
    response = http.post("/chat/stream", json=payload())

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
