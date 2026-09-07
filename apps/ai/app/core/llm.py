import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable

from openai import OpenAI

from app.config import get_settings

log = logging.getLogger("ai.llm")

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        settings = get_settings()
        # Explicit timeout so a hung request can't tie up a worker thread for the
        # ~600s SDK default; bounded retries smooth over transient 429/5xx.
        _client = OpenAI(
            base_url=settings.MODEL_BASE_URL or None,
            api_key=settings.MODEL_API_KEY or "9router",
            timeout=30,
            max_retries=2,
        )
    return _client


def complete_raw(
    system: str,
    messages: list[dict],
    max_tokens: int = 1024,
) -> dict:
    """OpenAI chat completion returning reply + token usage + response id."""
    resp = get_client().chat.completions.create(
        model=get_settings().AI_CHAT_MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "system", "content": system}, *messages],
    )
    usage = resp.usage
    return {
        "reply": resp.choices[0].message.content or "",
        "usage": {
            "input_tokens": usage.prompt_tokens if usage else 0,
            "output_tokens": usage.completion_tokens if usage else 0,
        },
        "response_id": resp.id,
    }


def complete(
    system: str,
    messages: list[dict],
    max_tokens: int = 1024,
) -> str:
    """Just the reply text. messages are [{role, content}] (user/assistant)."""
    return complete_raw(system, messages, max_tokens)["reply"]


async def complete_metered(
    system: str,
    messages: list[dict],
    workspace_id: str,
    max_tokens: int = 1024,
) -> str:
    """complete() gated by the workspace's AI token quota: check the limit before
    the call (raises quota.PlanLimitReached → 422 when over) and record spend
    after. For entry points NOT already metered by Elysia's chat-begin/chat-end."""
    from app.core import quota

    quota_start = time.monotonic()
    await quota.check_quota(workspace_id)
    quota_check_ms = (time.monotonic() - quota_start) * 1000

    call_start = time.monotonic()
    result = await asyncio.to_thread(complete_raw, system, messages, max_tokens)
    completion_call_ms = (time.monotonic() - call_start) * 1000

    log.info(
        "complete_metered timing: quota_check_ms=%.1f completion_call_ms=%.1f",
        quota_check_ms,
        completion_call_ms,
    )
    await quota.record_usage(workspace_id, result["usage"])
    return result["reply"]


def _stream_raw(
    system: str,
    messages: list[dict],
    max_tokens: int,
) -> dict:
    """Sync helper: drains an entire OpenAI streaming completion before
    returning.

    ponytail note on the asyncio.to_thread + streaming question: the OpenAI
    SDK's sync streaming iterator is a blocking generator bound to the thread
    that opened the HTTP connection. Handing that iterator back out of
    asyncio.to_thread and pulling chunks from it on the event loop would just
    move the blocking socket read onto the loop thread one chunk at a time —
    it doesn't actually get you concurrent, non-blocking iteration. Rather
    than build a cross-thread queue/callback bridge for "true" per-chunk
    yielding (real complexity for a low-volume Telegram chat path), we drain
    the whole stream inside the one to_thread call — same single blocking
    HTTP call complete_raw already makes — and hand back the list of deltas
    for the caller to yield from. This isn't realtime-per-network-chunk, but
    it's still a real improvement over today: the model's tokens are
    generated incrementally either way, so the deltas list is ready as soon as
    generation finishes, same latency complete_raw already had; the caller
    just gets to emit them as a sequence of small events instead of one big
    string, which is what Telegram's incremental-edit UI actually needs.
    """
    stream = get_client().chat.completions.create(
        model=get_settings().AI_CHAT_MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "system", "content": system}, *messages],
        stream=True,
    )
    deltas: list[str] = []
    usage_in = 0
    usage_out = 0
    response_id: str | None = None
    for chunk in stream:
        if chunk.id:
            response_id = chunk.id
        if chunk.choices:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                deltas.append(delta.content)
        if chunk.usage:
            usage_in = chunk.usage.prompt_tokens or usage_in
            usage_out = chunk.usage.completion_tokens or usage_out
    return {
        "deltas": deltas,
        "reply": "".join(deltas),
        "usage": {"input_tokens": usage_in, "output_tokens": usage_out},
        "response_id": response_id,
    }


async def complete_metered_stream(
    system: str,
    messages: list[dict],
    workspace_id: str,
    max_tokens: int = 1024,
):
    """Streaming counterpart to complete_metered, for the no-tools chat path
    (Telegram's fake-streaming via incremental message edits). Same quota
    shape as complete_metered — check before the call, record after — since
    callers use this INSTEAD of complete_metered, not alongside it; skipping
    either check here would silently bypass quota for this whole path.

    Yields {"type": "delta", "text": ...} chunks as they become available,
    followed by exactly one {"type": "done", "reply": ..., "usage": ...,
    "response_id": ...}.
    """
    from app.core import quota

    quota_start = time.monotonic()
    await quota.check_quota(workspace_id)
    quota_check_ms = (time.monotonic() - quota_start) * 1000

    call_start = time.monotonic()
    result = await asyncio.to_thread(_stream_raw, system, messages, max_tokens)
    completion_call_ms = (time.monotonic() - call_start) * 1000

    log.info(
        "complete_metered_stream timing: quota_check_ms=%.1f completion_call_ms=%.1f",
        quota_check_ms,
        completion_call_ms,
    )

    for text in result["deltas"]:
        yield {"type": "delta", "text": text}

    await quota.record_usage(workspace_id, result["usage"])
    yield {
        "type": "done",
        "reply": result["reply"],
        "usage": result["usage"],
        "response_id": result["response_id"],
    }


# execute_tool(name, args) -> {"result": any, "artifact": {type, payload} | None}
ToolExecutor = Callable[[str, dict], Awaitable[dict]]


async def complete_with_tools(
    system: str,
    messages: list[dict],
    tools: list[dict],
    execute_tool: ToolExecutor,
    max_steps: int = 10,
) -> dict:
    """Multi-step tool-calling loop (mirrors the TS orchestrator).

    Runs the OpenAI tool loop, forwarding each tool call to `execute_tool`.
    Accumulates token usage across steps and collects EVERY artifact a tool
    returns during the turn (a "full breakdown" request can call
    getSpendingAnalysis + getBurnRate + getDebtAnalysis in one turn — keeping
    only the last one silently dropped the others and mislabeled the canvas
    tab). The sync OpenAI client is offloaded with asyncio.to_thread so tool
    I/O stays concurrent.
    """
    client = get_client()
    model = get_settings().AI_CHAT_MODEL
    convo: list[dict] = [{"role": "system", "content": system}, *messages]

    usage_in = 0
    usage_out = 0
    artifacts: list[dict] = []
    response_id: str | None = None
    reply = ""

    for step in range(max_steps):
        # On the final allowed step, stop offering tools so the model must
        # produce a text answer instead of another tool call we can't run.
        use_tools = step < max_steps - 1
        resp = await asyncio.to_thread(
            lambda ut=use_tools: client.chat.completions.create(
                model=model,
                messages=convo,
                # Cap output like every other call site; without it a runaway
                # reply can emit up to the model max at output-token prices.
                max_tokens=1024,
                # Match the TS orchestrator default. ponytail: per-workspace
                # temperature/model overrides aren't plumbed to the sidecar yet.
                temperature=0.7,
                **({"tools": tools, "tool_choice": "auto"} if ut else {}),
            )
        )
        if resp.usage:
            usage_in += resp.usage.prompt_tokens
            usage_out += resp.usage.completion_tokens
            # Prompt-cache visibility: how many input tokens hit OpenAI's
            # automatic cache (the stable system+tools prefix). >0 confirms the
            # cacheable-prefix restructure is working.
            details = getattr(resp.usage, "prompt_tokens_details", None)
            cached = getattr(details, "cached_tokens", 0) if details else 0
            if cached:
                log.info(
                    "prompt_cache hit: cached=%d/%d input tokens",
                    cached,
                    resp.usage.prompt_tokens,
                )
        response_id = resp.id

        msg = resp.choices[0].message
        tool_calls = msg.tool_calls
        if not tool_calls:
            reply = msg.content or ""
            break

        convo.append(msg.model_dump(exclude_none=True))
        for tc in tool_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            out = await execute_tool(tc.function.name, args)
            art = out.get("artifact")
            log.info(
                "tool=%s artifact=%s",
                tc.function.name,
                art.get("type") if art else None,
            )
            if art:
                artifacts.append(art)
            convo.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(out.get("result")),
                }
            )

    return {
        "reply": reply,
        "usage": {"input_tokens": usage_in, "output_tokens": usage_out},
        "artifacts": artifacts,
        "response_id": response_id,
    }


async def complete_with_tools_stream(
    system: str,
    messages: list[dict],
    tools: list[dict],
    execute_tool: ToolExecutor,
    max_steps: int = 10,
):
    """Streaming multi-step tool-calling loop.
    Yields event dicts:
      {"event": "thinking", "data": {"text": "..."}}
      {"event": "tool_call", "data": {"name": "...", "args": {...}}}
      {"event": "content", "data": {"text": "..."}}
      {"event": "artifact", "data": {...}}
      {"event": "done", "data": {"reply": "...", "usage": {...}, "artifacts": [{...}]}}
    """
    client = get_client()
    model = get_settings().AI_CHAT_MODEL
    convo: list[dict] = [{"role": "system", "content": system}, *messages]

    usage_in = 0
    usage_out = 0
    artifacts: list[dict] = []
    response_id: str | None = None
    full_reply = ""
    in_think_tag = False

    for step in range(max_steps):
        use_tools = step < max_steps - 1
        
        # Stream completions
        kwargs = {
            "model": model,
            "messages": convo,
            "max_tokens": 1024,
            "temperature": 0.7,
            "stream": True,
        }
        if use_tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        stream = await asyncio.to_thread(lambda: client.chat.completions.create(**kwargs))

        tool_calls_map: dict[int, dict] = {}
        curr_content = ""

        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta

            # 1. Reasoning/Thinking extraction (DeepSeek-R1 / Qwen style reasoning_content)
            reasoning = getattr(delta, "reasoning_content", None)
            if reasoning:
                yield {"event": "thinking", "data": {"text": reasoning}}

            # 2. Regular content streaming + inline <think> tags support
            content = delta.content or ""
            if content:
                # Handle inline <think>...</think> tags if reasoning emitted in content
                while content:
                    if not in_think_tag:
                        if "<think>" in content:
                            before, after = content.split("<think>", 1)
                            if before:
                                yield {"event": "content", "data": {"text": before}}
                                curr_content += before
                            in_think_tag = True
                            content = after
                        else:
                            yield {"event": "content", "data": {"text": content}}
                            curr_content += content
                            content = ""
                    else:
                        if "</think>" in content:
                            think_text, after = content.split("</think>", 1)
                            if think_text:
                                yield {"event": "thinking", "data": {"text": think_text}}
                            in_think_tag = False
                            content = after
                        else:
                            yield {"event": "thinking", "data": {"text": content}}
                            content = ""

            # 3. Tool call deltas
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in tool_calls_map:
                        tool_calls_map[idx] = {
                            "id": tc.id or "",
                            "name": tc.function.name if tc.function else "",
                            "arguments": tc.function.arguments if tc.function else "",
                        }
                    else:
                        if tc.id:
                            tool_calls_map[idx]["id"] += tc.id
                        if tc.function and tc.function.name:
                            tool_calls_map[idx]["name"] += tc.function.name
                        if tc.function and tc.function.arguments:
                            tool_calls_map[idx]["arguments"] += tc.function.arguments

            if chunk.usage:
                usage_in += chunk.usage.prompt_tokens or 0
                usage_out += chunk.usage.completion_tokens or 0

        # End of stream chunk iteration
        if not tool_calls_map:
            full_reply = curr_content
            break

        # We had tool calls, execute them
        assistant_tool_calls = [
            {
                "id": tc_data["id"],
                "type": "function",
                "function": {
                    "name": tc_data["name"],
                    "arguments": tc_data["arguments"],
                },
            }
            for tc_data in sorted(tool_calls_map.values(), key=lambda x: x["id"])
        ]
        convo.append({
            "role": "assistant",
            "content": curr_content or None,
            "tool_calls": assistant_tool_calls,
        })

        for tc_data in tool_calls_map.values():
            name = tc_data["name"]
            try:
                args = json.loads(tc_data["arguments"] or "{}")
            except json.JSONDecodeError:
                args = {}

            yield {"event": "tool_call", "data": {"name": name, "args": args}}
            out = await execute_tool(name, args)
            art = out.get("artifact")
            if art:
                artifacts.append(art)
                yield {"event": "artifact", "data": art}

            convo.append({
                "role": "tool",
                "tool_call_id": tc_data["id"],
                "content": json.dumps(out.get("result")),
            })

    yield {
        "event": "done",
        "data": {
            "reply": full_reply,
            "usage": {"input_tokens": usage_in, "output_tokens": usage_out},
            "artifacts": artifacts,
            "provider": {"name": "9router", "response_id": response_id},
        },
    }
