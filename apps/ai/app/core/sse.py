"""Server-sent events, sealed one at a time.

A stream has no single body to seal, so the OWE1 layer passes
`text/event-stream` through untouched and the route that writes the events
seals each one itself (docs/api/encryption.md#chat-stream-events).

The sequence number lives here rather than in each route, because it is what
makes a dropped, reordered or swapped event fail to open. Starting it
anywhere but zero, or letting two routes share a counter, silently breaks
that.
"""

from __future__ import annotations

import json
from typing import Any

from app.core import owe1

#: A stream is not cacheable and must not be buffered. A proxy that holds
#: events back turns a streaming chat into a slow request
#: (docs/ai/service.md#streaming-protocol).
SSE_HEADERS = {
    "cache-control": "no-store",
    "x-accel-buffering": "no",
}

MEDIA_TYPE = "text/event-stream"


def _compact(payload: Any) -> bytes:
    # No newline can appear inside a `data:` line, so the JSON is compact and
    # separators are explicit rather than left to a default.
    return json.dumps(payload, separators=(",", ":")).encode()


class EventWriter:
    """Formats one event, sealing it when the request carried a session.

    Plaintext is the development path the OWE1 layer already allows: with
    encryption off there is no key to seal with, and the event is otherwise
    identical, so the chat UI parses one shape either way.
    """

    def __init__(self, owe1_scope: dict[str, Any] | None) -> None:
        self._scope = owe1_scope
        self._seq = 0

    @property
    def seq(self) -> int:
        return self._seq

    def event(self, name: str, payload: dict[str, Any]) -> bytes:
        data = _compact(payload)

        if self._scope is not None:
            keys: owe1.SessionKeys = self._scope["keys"]
            data = _compact(
                owe1.seal(
                    keys.server_to_client,
                    owe1.aad_stream_event(
                        self._scope["session_id"], self._scope["request_id"], self._seq
                    ),
                    data,
                )
            )

        self._seq += 1
        return b"event: " + name.encode() + b"\ndata: " + data + b"\n\n"
