"""`POST /chat/stream`.

The turn the user is watching. Tokens leave as they arrive, each one a
sealed event, and the stream always ends on `done` or `error`
(docs/ai/service.md#streaming-protocol).

The turn itself is the tool loop in `app/modules/chat/loop.py` (US-030),
and the loop is handed to the response whole rather than wrapped, so that a
caller hanging up reaches the generator holding the model stream. This
module only decides what the loop is given: the event writer with this
request's sealing keys, the settings, and the client it calls the API back
with.

Everything the turn needs (wallets, categories, settings) arrives in the
request body, because this service reads no database (D3, CHAT-7), and
every side effect goes back through the API (D4).
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.config import Settings
from app.core.sse import MEDIA_TYPE, SSE_HEADERS, EventWriter
from app.modules.chat import loop
from app.modules.chat.schemas import ChatStreamRequest

router = APIRouter()


@router.post("/chat/stream")
async def chat_stream(body: ChatStreamRequest, request: Request) -> StreamingResponse:
    config: Settings = request.app.state.config

    return StreamingResponse(
        # Handed to the response whole, not wrapped: the generator that
        # holds the model stream has to be the one a cancellation reaches.
        loop.run_turn(
            # The OWE1 layer leaves an event stream alone, so the keys it put
            # on the scope are how each event gets sealed. Absent means
            # encryption is off, which only development allows.
            writer=EventWriter(request.scope.get("owe1")),
            body=body,
            config=config,
            # One client for the process, holding one crypto session. Every
            # tool call this turn makes goes through it (D4, D22).
            api=request.app.state.api,
        ),
        media_type=MEDIA_TYPE,
        headers=SSE_HEADERS,
    )
