import asyncio
import logging
import time

from app.core import llm
from app.core.currency import get_currency_settings
from app.core.database import fetch, fetchrow
from app.config import get_settings
from app.modules.chatbot import prompts, tools
from app.modules.chatbot.memory import load_history

log = logging.getLogger("ai.chatbot")


async def _balance(workspace_id: str) -> float:
    row = await fetchrow(
        """
        SELECT COALESCE(SUM(balance), 0) AS total FROM wallets
        WHERE workspace_id = $1 AND deleted_at IS NULL
          AND is_included_in_totals = true
        """,
        workspace_id,
    )
    return float(row["total"]) if row else 0.0


async def _recent_transactions(workspace_id: str, limit: int = 10) -> list[dict]:
    rows = await fetch(
        """
        SELECT t.amount, t.type, t.date, t.description, t.name, c.name AS category
        FROM transactions t
        LEFT JOIN categories c ON c.id = t.category_id AND c.deleted_at IS NULL
        WHERE t.workspace_id = $1 AND t.deleted_at IS NULL
        ORDER BY t.date DESC
        LIMIT $2
        """,
        workspace_id,
        limit,
    )
    return [dict(r) for r in rows]


_TITLE_SYSTEM_PROMPT = (
    "Write a 2-4 word title summarizing the topic of this chat message. "
    "No punctuation, no quotes, title case. Reply with ONLY the title."
)


async def generate_title(message: str, workspace_id: str) -> str | None:
    """Short LLM-written session title. Cosmetic — callers must tolerate None
    (quota exceeded, model error) and keep whatever title they already have."""
    try:
        title = await llm.complete_metered(
            _TITLE_SYSTEM_PROMPT,
            [{"role": "user", "content": message}],
            workspace_id,
            max_tokens=12,
        )
    except Exception:
        log.warning("Title generation failed", exc_info=True)
        return None

    title = title.strip().strip('"').strip("'")
    return title or None


async def _noop_history() -> list[dict]:
    return []


async def _chat_context(
    workspace_id: str, session_id: str | None
) -> tuple[float, list[dict], dict, list[dict]]:
    """Fetch every piece of pre-LLM context concurrently — none of these
    fetches depends on another's result, so gather() replaces 4 sequential
    awaits with one round-trip's worth of wall time. Shared by chat() and
    stream_chat() so the parallelization lives in exactly one place."""
    balance, txns, currency, history = await asyncio.gather(
        _balance(workspace_id),
        _recent_transactions(workspace_id),
        get_currency_settings(workspace_id),
        load_history(session_id, workspace_id) if session_id else _noop_history(),
    )
    return balance, txns, currency, history


async def chat(
    message: str, workspace_id: str, user_id: str | None, session_id: str | None
) -> dict:
    db_start = time.monotonic()
    balance, txns, currency, history = await _chat_context(workspace_id, session_id)
    db_fetch_ms = (time.monotonic() - db_start) * 1000

    system = prompts.system_prompt(balance, txns, currency)
    messages = history + [{"role": "user", "content": message}]

    llm_start = time.monotonic()
    # Telegram replies are short-form chat, not canvas/report generation — cap
    # well below the 1024 default so a runaway reply doesn't add latency.
    reply = await llm.complete_metered(system, messages, workspace_id, max_tokens=512)
    llm_call_ms = (time.monotonic() - llm_start) * 1000

    log.info(
        "chat() timing: db_fetch_ms=%.1f llm_call_ms=%.1f",
        db_fetch_ms,
        llm_call_ms,
    )
    # Elysia owns ai_messages persistence; we just echo the session id back.
    return {"reply": reply, "session_id": session_id}


async def stream_chat(
    message: str, workspace_id: str, user_id: str | None, session_id: str | None
):
    """Streaming variant of chat(): same parallelized DB-fetch setup, but
    streams the LLM reply as SSE-shaped events (content deltas, then a final
    done event) instead of returning one completed string — the fake-streaming
    fix for Telegram's perceived latency (incremental message edits on the
    apps/api side consume this).

    Quota gating (check before the call, record after) happens inside
    llm.complete_metered_stream, which this bypasses complete_metered to call
    directly — that helper is the single place check_quota/record_usage run
    for this path, exactly once each, mirroring complete_metered's own gating.
    """
    db_start = time.monotonic()
    balance, txns, currency, history = await _chat_context(workspace_id, session_id)
    db_fetch_ms = (time.monotonic() - db_start) * 1000
    log.info("stream_chat() timing: db_fetch_ms=%.1f", db_fetch_ms)

    system = prompts.system_prompt(balance, txns, currency)
    messages = history + [{"role": "user", "content": message}]

    async for chunk in llm.complete_metered_stream(
        system, messages, workspace_id, max_tokens=512
    ):
        if chunk["type"] == "delta":
            yield {"event": "content", "data": {"text": chunk["text"]}}
        else:  # "done"
            yield {
                "event": "done",
                "data": {
                    "reply": chunk["reply"],
                    "session_id": session_id,
                    "usage": chunk["usage"],
                },
            }


async def run_chat(
    system_prompt: str,
    history: list[dict],
    workspace_id: str,
    user_id: str,
) -> dict:
    """Service-to-service LLM tool loop for the Telegram + in-process
    fallback path. Elysia owns chat-begin/chat-end (identity, session, quota); this
    just runs the loop and executes tools locally. Returns {reply, usage, artifact,
    response_id}."""

    async def run_tool(name: str, args: dict) -> dict:
        return await tools.execute_tool(name, args, workspace_id, user_id)

    convo = [
        {"role": m["role"], "content": m["content"]}
        for m in history
        if m.get("role") in ("user", "assistant")
    ]
    return await llm.complete_with_tools(
        system_prompt,
        convo,
        tools.WEB_TOOLS,
        run_tool,
        max_steps=get_settings().AI_MAX_STEPS,
    )


async def web_chat(
    messages: list[dict],
    token: str,
    session_id: str | None,
    web_search: bool,
) -> dict:
    """Direct web→ai chat: the browser's server action calls this. Python drives
    the LLM tool loop, but the money path stays in Elysia: `chat_begin` resolves
    identity (from the forwarded JWT), session, quota + prompt; `chat_end` persists
    the reply and increments tokens. Every canvas an analysis tool returns during
    the turn is collected into `artifacts` (a turn can call more than one
    analysis tool, e.g. spending + burn rate + debts). Raises tools.ApiError for
    quota/auth (forwarded by route).
    """
    begin = await tools.chat_begin(token, messages, session_id, web_search)

    # Receipt-draft turns already produced + persisted a reply in Elysia.
    if begin.get("kind") == "early":
        return {
            "session_id": begin["session_id"],
            "reply": begin["reply"],
            "usage": {"input_tokens": 0, "output_tokens": 0},
            "artifacts": [],
            "provider": None,
        }

    workspace_id = begin["workspace_id"]
    user_id = begin["user_id"]
    current_tokens = begin["current_tokens"]
    session_id = begin["session_id"]

    convo = [
        {"role": m["role"], "content": m["content"]}
        for m in begin["history"]
        if m["role"] in ("user", "assistant")
    ]

    async def run_tool(name: str, args: dict) -> dict:
        return await tools.execute_tool(name, args, workspace_id, user_id)

    result = await llm.complete_with_tools(
        begin["system_prompt"],
        convo,
        tools.WEB_TOOLS,
        run_tool,
        max_steps=get_settings().AI_MAX_STEPS,
    )

    # The LLM already ran (tokens spent) — never fail the user's reply over a
    # persistence hiccup; log it so the under-count is visible.
    try:
        await tools.chat_end(workspace_id, session_id, result, current_tokens)
    except Exception:
        log.exception("chat_end failed; reply returned but usage/persist incomplete")

    return {
        "session_id": session_id,
        "reply": result["reply"],
        "usage": result["usage"],
        "artifacts": result["artifacts"],
        "provider": {"name": "9router", "response_id": result.get("response_id")},
    }


async def stream_web_chat(
    messages: list[dict],
    token: str,
    session_id: str | None,
    web_search: bool,
):
    """Streaming web chat: yields SSE events for live thinking and text tokens."""
    begin = await tools.chat_begin(token, messages, session_id, web_search)

    if begin.get("kind") == "early":
        yield {
            "event": "content",
            "data": {"text": begin["reply"]},
        }
        yield {
            "event": "done",
            "data": {
                "session_id": begin["session_id"],
                "reply": begin["reply"],
                "usage": {"input_tokens": 0, "output_tokens": 0},
                "artifacts": [],
                "provider": None,
            },
        }
        return

    workspace_id = begin["workspace_id"]
    user_id = begin["user_id"]
    current_tokens = begin["current_tokens"]
    session_id = begin["session_id"]

    convo = [
        {"role": m["role"], "content": m["content"]}
        for m in begin["history"]
        if m["role"] in ("user", "assistant")
    ]

    async def run_tool(name: str, args: dict) -> dict:
        return await tools.execute_tool(name, args, workspace_id, user_id)

    final_result = None
    async for event in llm.complete_with_tools_stream(
        begin["system_prompt"],
        convo,
        tools.WEB_TOOLS,
        run_tool,
        max_steps=get_settings().AI_MAX_STEPS,
    ):
        if event["event"] == "done":
            final_result = event["data"]
            final_result["session_id"] = session_id
            try:
                await tools.chat_end(workspace_id, session_id, final_result, current_tokens)
            except Exception:
                log.exception("chat_end failed; stream completed but persist incomplete")
            yield {"event": "done", "data": final_result}
        else:
            yield event
