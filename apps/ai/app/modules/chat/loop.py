"""The tool loop (CHAT-3, CHAT-5, US-030).

One user turn: show the model the eleven tools, stream whatever text it
writes, execute the tool calls it asks for through the API, feed the results
back, and repeat until it stops asking or the round cap is reached
(docs/ai/service.md#the-tool-loop).

Four rules here are controls rather than style, and each one is a line of
code somebody could "simplify" away:

- **Only a structured `tool_use` block is a tool call.** Text that looks
  like one is text. See `PseudoToolFilter` for why that sentence exists.
- **`turn_id` is echoed, never minted.** The API counts every per-turn cap
  against it, so a service that produced its own per call would hand itself
  a fresh budget each time and walk through the caps (D68).
- **A refusal is relayed, never retried.** The model reports what the API
  said; it does not rephrase the same call.
- **A failure is a tool result, not an exception.** An exception kills the
  turn. A result lets the model tell the user what happened.

Nothing here does arithmetic and nothing here asks the model to (D27).
Every figure in a tool result was computed, rounded and formatted in Rust
before it arrived.

Nothing here logs prompt text, message content, a tool argument or a tool
result (OPS-3). Tool names and codes are structure, not content.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections.abc import AsyncIterator
from typing import Any

from app.config import Settings
from app.core import model, owe1_client
from app.core.sse import EventWriter
from app.modules.chat.prompt import build_system_prompt
from app.modules.chat.schemas import ChatStreamRequest
from app.modules.chat.tools import TOOL_DEFINITIONS

logger = logging.getLogger("oewang.ai.chat")

#: The API's one door for a tool call (docs/api/endpoints.md#internal).
TOOLS_EXECUTE_PATH = "/v1/internal/tools/execute"

#: The code a tool result carries when the call never reached the API. Not
#: one of the API's refusals: it says the work was not attempted, which is a
#: different thing to say to the user than "the server said no".
TOOL_FAILED = "TOOL_FAILED"

#: What the API refuses with. Every one of them is relayed to the user as
#: text and none of them is retried (docs/ai/service.md#the-tool-loop).
REFUSAL_CODES = frozenset(
    {
        "TOOL_NOT_FOUND",
        "TOOL_ARGS_INVALID",
        "TOOL_FORBIDDEN",
        "TOOL_CAP_EXCEEDED",
        "CONFIRMATION_REQUIRED",
    }
)

#: Fixed text, because an exception string can carry anything, including the
#: prompt (OPS-3).
UNREACHABLE_SUMMARY = "the tool call did not reach the API"

#: What the `error` event says when the model call itself fails. Fixed text,
#: for the same reason.
MODEL_FAILED_MESSAGE = "the model call failed"


# --------------------------------------------------------------- the screen

_OPEN_TAG = re.compile(r"<\s*(?:tool_call|tool_response)\b[^>]*>", re.IGNORECASE)
_CLOSE_TAG = re.compile(r"<\s*/\s*(?:tool_call|tool_response)\s*>", re.IGNORECASE)

#: The longest tail that could still turn out to be the start of one of
#: those tags. Anything longer is text and is released.
_MAX_PENDING = 64


class PseudoToolFilter:
    """Keeps fabricated tool calls out of the assistant's text.

    The gateway behind `AI_BASE_URL` has been observed writing `<tool_call>`
    and `<tool_response>` pseudo-XML as plain assistant text, carrying
    invented transaction amounts against real wallet and category ids it had
    read out of this service's own system prompt, on a turn where no tools
    were attached at all.

    Two separate things follow, and this class is only the second one. The
    loop acts solely on structured `tool_use` blocks, so such text executes
    nothing whatever it says. This keeps it off the screen as well, because
    a user shown an invented transaction in a tool card believes it.

    Works on a stream, so a tag split across two chunks is still a tag: text
    that could still become an opening tag is held back until it either is
    one or cannot be. Fails closed, so an opening tag whose close never
    arrives swallows the rest of the reply rather than releasing half a
    fabricated call.
    """

    def __init__(self) -> None:
        self._buffer = ""
        self._suppressing = False
        self._dropped = False

    def feed(self, text: str) -> str:
        """The part of `text` that is safe to show, which may be empty."""
        self._buffer += text
        return self._drain(final=False)

    def flush(self) -> str:
        """Whatever is still held back at the end of the stream."""
        return self._drain(final=True)

    @property
    def suppressed(self) -> bool:
        """Did this screen drop anything? Logged per turn, never the text."""
        return self._dropped

    def _drain(self, *, final: bool) -> str:
        out: list[str] = []

        while True:
            if self._suppressing:
                closing = _CLOSE_TAG.search(self._buffer)
                if closing is None:
                    # Hold everything: the close may still arrive, and at
                    # the end of the stream it never will.
                    if final:
                        self._buffer = ""
                    return "".join(out)
                self._buffer = self._buffer[closing.end() :]
                self._suppressing = False
                continue

            opening = _OPEN_TAG.search(self._buffer)
            if opening is not None:
                out.append(self._buffer[: opening.start()])
                self._buffer = self._buffer[opening.end() :]
                self._suppressing = True
                self._dropped = True
                continue

            hold = len(self._buffer) if final else self._pending_index()
            out.append(self._buffer[:hold])
            self._buffer = self._buffer[hold:]
            return "".join(out)

    def _pending_index(self) -> int:
        """How much of the buffer is safe to release now."""
        start = self._buffer.rfind("<")
        if start < 0:
            return len(self._buffer)

        tail = self._buffer[start:]
        if ">" in tail or len(tail) > _MAX_PENDING:
            # A finished tag that is not one of ours, or too long to become
            # one. Either way it is text.
            return len(self._buffer)
        return start


# ------------------------------------------------------------------ calling


def _error_payload(error: owe1_client.ApiError) -> dict[str, Any]:
    """The refusal, as the model sees it.

    The API's own `hint` travels with it. `CONFIRMATION_REQUIRED` carries the
    target row in `fields`, which is what lets the assistant quote the row
    back and ask instead of describing a delete it cannot see (D20).
    """
    body: dict[str, Any] = {"code": error.code, "message": error.message}
    if error.hint:
        body["hint"] = error.hint
    if error.fields:
        body["fields"] = error.fields
    return body


async def execute_tool(
    api: Any,
    body: ChatStreamRequest,
    name: str,
    args: dict[str, Any],
    call_id: str | None = None,
) -> tuple[bool, dict[str, Any], str]:
    """One tool call. Returns `(ok, what the model is told, one-line summary)`.

    This never raises. A refusal and a failure are both answers the model has
    to be able to explain, and an exception here would end the turn instead.
    """
    request = {
        "workspace_id": body.workspace_id,
        "user_id": body.user_id,
        # A claim, which the API re-checks against the membership row.
        "role": body.role,
        "session_id": body.session_id,
        # The API minted this. It is echoed unchanged, because the per-turn
        # caps are counted against it (D68, SEC-23).
        "turn_id": body.turn_id,
        # The model's id for the call. The API keys the canvas artifact an
        # analysis tool builds by it and sends it on the stream itself; the
        # artifact never comes back through here (D88).
        "call_id": call_id,
        "tool": name,
        "args": args,
    }

    try:
        data = await api.post(TOOLS_EXECUTE_PATH, request)
    except owe1_client.ApiError as error:
        logger.info("tool %s refused with %s", name, error.code)
        payload = {"ok": False, "error": _error_payload(error)}
        return False, payload, error.message or error.code
    except owe1_client.ClientError as error:
        # The type and nothing else: a transport message can quote the
        # request back (OPS-3).
        logger.warning("tool %s did not reach the API: %s", name, type(error).__name__)
        payload = {"ok": False, "error": {"code": TOOL_FAILED, "message": UNREACHABLE_SUMMARY}}
        return False, payload, UNREACHABLE_SUMMARY

    if not isinstance(data, dict):
        logger.warning("tool %s answered outside the agreed shape", name)
        payload = {"ok": False, "error": {"code": TOOL_FAILED, "message": UNREACHABLE_SUMMARY}}
        return False, payload, UNREACHABLE_SUMMARY

    summary = str(data.get("summary", ""))
    return True, {"ok": True, "result": data.get("result"), "summary": summary}, summary


# --------------------------------------------------------------- the loop


def _tool_uses(message: Any) -> list[Any]:
    """The structured tool calls, and only those.

    The single most important line in this module. Text shaped like a tool
    call is never parsed into one, whatever it claims to be.
    """
    return [
        block
        for block in (getattr(message, "content", None) or [])
        if getattr(block, "type", None) == "tool_use"
    ]


def _assistant_content(message: Any) -> tuple[list[dict[str, Any]], bool]:
    """The assistant turn, as plain dicts to send back with the next call.

    Text goes through the same screen the user saw, so what was kept off the
    screen is kept out of the conversation too: a fabricated call echoed back
    is a fabricated call the next round has learned from. An empty text block
    is dropped rather than sent, because the Messages API refuses one.

    Returns the blocks and whether anything was screened out.
    """
    blocks: list[dict[str, Any]] = []
    screened = False

    for block in getattr(message, "content", None) or []:
        kind = getattr(block, "type", None)
        if kind == "text":
            screen = PseudoToolFilter()
            text = screen.feed(getattr(block, "text", "") or "") + screen.flush()
            if text.strip():
                blocks.append({"type": "text", "text": text})
            screened = screened or screen.suppressed
        elif kind == "tool_use":
            arguments = getattr(block, "input", None)
            blocks.append(
                {
                    "type": "tool_use",
                    "id": getattr(block, "id", ""),
                    "name": getattr(block, "name", ""),
                    "input": arguments if isinstance(arguments, dict) else {},
                }
            )

    return blocks, screened



async def run_turn(
    *, writer: EventWriter, body: ChatStreamRequest, config: Settings, api: Any
) -> AsyncIterator[bytes]:
    """One turn, as the sealed events it produces.

    Yields `token`, `tool_call` and `tool_result` as they happen and ends on
    `done`, or on `error` if the model call failed. A stream never ends
    silently (docs/ai/service.md#streaming-protocol).

    The writer comes in, and the failure handling stays inside this
    generator rather than in a wrapper around it, because both are load
    bearing. A caller hanging up arrives as a cancellation thrown into
    whichever generator is suspended; a wrapper would catch it one level
    above the model stream and leave the provider generating into nothing
    until the event loop got round to finalizing this one.
    """
    try:
        started = time.perf_counter()
        system = build_system_prompt(
            role=body.role, context=body.context, settings=body.settings, channel=body.channel
        )

        messages: list[dict[str, Any]] = list(body.bounded_history())
        messages.append({"role": "user", "content": body.message})
        # Attachments are validated on the way in and deliberately not
        # forwarded. A receipt is text somebody else wrote, and the component
        # that reads it is the one with no tools, never this one (D24, SEC-21).
        # The capture path is POST /receipt/parse.

        client = model.model_client()
        usage = model.usage_report(0, 0, config.ai_chat_model)
        called: list[str] = []
        screened = False
        rounds = 0
        capped = True

        for step in range(1, config.ai_max_steps + 1):
            rounds = step
            screen = PseudoToolFilter()

            async with client.messages.stream(
                model=config.ai_chat_model,
                max_tokens=config.ai_max_output_tokens,
                system=system,
                messages=messages,
                # The eleven, every round. The model's own answer decides
                # whether any of them runs (D17).
                tools=TOOL_DEFINITIONS,
            ) as stream:
                async for text in stream.text_stream:
                    visible = screen.feed(text)
                    if visible:
                        yield writer.event("token", {"text": visible})
                visible = screen.flush()
                if visible:
                    yield writer.event("token", {"text": visible})
                final = await stream.get_final_message()

            tokens_in, tokens_out = model.tokens_of(final)
            usage["input"] += tokens_in
            usage["output"] += tokens_out

            calls = _tool_uses(final)
            content, echoed = _assistant_content(final)
            screened = screened or screen.suppressed or echoed

            if not calls:
                capped = False
                break

            messages.append({"role": "assistant", "content": content})

            results: list[dict[str, Any]] = []
            for block in calls:
                call_id = str(getattr(block, "id", "") or "")
                name = str(getattr(block, "name", "") or "")
                arguments = getattr(block, "input", None)
                args = arguments if isinstance(arguments, dict) else {}
                called.append(name)

                yield writer.event("tool_call", {"id": call_id, "name": name, "args": args})

                ok, payload, summary = await execute_tool(api, body, name, args, call_id)

                yield writer.event("tool_result", {"id": call_id, "ok": ok, "summary": summary})

                results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": call_id,
                        "content": json.dumps(payload, separators=(",", ":")),
                        "is_error": not ok,
                    }
                )

            # A tool result travels as a user turn; that is the Messages API's
            # shape, not a claim that the user said anything.
            messages.append({"role": "user", "content": results})

        if capped:
            # The cap stops the loop and returns what it has rather than looping
            # (CHAT-5). The API's per-turn caps are the other half of this and
            # are enforced there, not here.
            logger.info("the tool loop stopped at the %d round cap", config.ai_max_steps)

        yield writer.event("done", {"message_id": None, "usage": usage})

        logger.info(
            "chat turn for workspace %s session %s: %d rounds, tools %s, "
            "%d input and %d output tokens in %dms%s",
            body.workspace_id,
            body.session_id,
            rounds,
            called or "none",
            usage["input"],
            usage["output"],
            int((time.perf_counter() - started) * 1000),
            ", fabricated tool markup was screened out" if screened else "",
        )

    except asyncio.CancelledError:
        # The caller hung up, so there is nobody left to send `done` to.
        # Ending here is clean because an event is written whole or not at
        # all: whatever the API already read is a consistent prefix of the
        # reply, which is what it persists (CHAT-9).
        #
        # This handler is inside the generator that holds the model stream
        # on purpose. A cancellation is thrown into whichever generator is
        # suspended, so a wrapper around this one would catch it a level
        # above the stream and leave the provider generating into nothing.
        logger.info("the turn was aborted after %d events", writer.seq)
        raise
    except model.ModelUnavailable:
        yield writer.event(
            "error", {"code": "MODEL_UNAVAILABLE", "message": "no model is configured"}
        )
    except Exception as exc:
        # The exception type, never its message: a provider error can quote
        # the request back (OPS-3).
        logger.error("the turn failed with %s", type(exc).__name__)
        yield writer.event("error", {"code": "MODEL_FAILED", "message": MODEL_FAILED_MESSAGE})
