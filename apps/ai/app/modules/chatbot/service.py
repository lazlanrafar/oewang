from app.config import get_settings
from app.core import llm
from app.core.database import fetch, fetchrow
from app.modules.chatbot import tools
from app.utils.logger import get_logger

log = get_logger("ai.chatbot")


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


async def chat(
    message: str, workspace_id: str, user_id: str | None, session_id: str | None
) -> dict:
    if not user_id:
        raise ValueError("Verified user identity required")
    text = ""
    result = {}
    async for event in stream_service_chat(workspace_id, user_id, message, session_id):
        if event["event"] == "content":
            text += event["data"].get("text", "")
        elif event["event"] == "done":
            result = event["data"]
    return {**result, "reply": result.get("reply", text)}


async def stream_chat(
    message: str, workspace_id: str, user_id: str | None, session_id: str | None
):
    if not user_id:
        raise ValueError("Verified user identity required")
    async for event in stream_service_chat(workspace_id, user_id, message, session_id):
        yield event


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
        return await tools.execute_tool(
            name,
            args,
            workspace_id,
            user_id,
            memory_evidence=begin.get("memory_evidence", ""),
            personal_memory=begin.get("personal_memory", False),
        )

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
        return await tools.execute_tool(
            name,
            args,
            workspace_id,
            user_id,
            memory_evidence=begin.get("memory_evidence", ""),
            personal_memory=begin.get("personal_memory", False),
        )

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
                await tools.chat_end(
                    workspace_id, session_id, final_result, current_tokens
                )
            except Exception:
                log.exception(
                    "chat_end failed; stream completed but persist incomplete"
                )
            yield {"event": "done", "data": final_result}
        else:
            yield event


async def stream_service_chat(
    workspace_id: str,
    user_id: str,
    message: str,
    session_id: str | None,
    *,
    personal_memory: bool = False,
):
    """Streaming tool-loop chat for trusted service callers (x-api-key,
    explicit workspace/user id — no JWT) — apps/worker's Telegram handler.
    Same money path as stream_web_chat (chat_begin_core/chat_end_core), minus
    the JWT hop: one latest message in, session history reconstructed by
    chat_begin_core itself from `session_id`. Raises quota.PlanLimitReached /
    chat_money_path.SessionNotFoundError — the route catches and emits an
    "error" SSE event, same shape as the "content"/"done" events below."""
    from app.modules.chatbot.chat_money_path import chat_begin_core

    begin = await chat_begin_core(
        workspace_id,
        user_id,
        [{"role": "user", "content": message}],
        session_id,
        personal_memory=personal_memory,
    )

    if begin["kind"] == "early":
        yield {"event": "content", "data": {"text": begin["reply"]}}
        yield {
            "event": "done",
            "data": {
                "session_id": begin["sessionId"],
                "reply": begin["reply"],
                "plain_text": True,
                "language": begin.get("language", "en"),
                "usage": {"input_tokens": 0, "output_tokens": 0},
                "artifacts": [],
            },
        }
        return

    current_session_id = begin["sessionId"]
    current_tokens = begin["currentTokens"]
    convo = [
        {"role": m["role"], "content": m["content"]}
        for m in begin["history"]
        if m["role"] in ("user", "assistant")
    ]

    async def run_tool(name: str, args: dict) -> dict:
        return await tools.execute_tool(
            name,
            args,
            workspace_id,
            user_id,
            memory_evidence=begin.get("memory_evidence", ""),
            personal_memory=begin.get("personal_memory", False),
        )

    async for event in llm.complete_with_tools_stream(
        begin["systemPrompt"],
        convo,
        tools.WEB_TOOLS,
        run_tool,
        max_steps=get_settings().AI_MAX_STEPS,
    ):
        if event["event"] == "done":
            final_result = event["data"]
            final_result["session_id"] = current_session_id
            final_result["language"] = begin.get("language", "en")
            try:
                await tools.chat_end(
                    workspace_id, current_session_id, final_result, current_tokens
                )
            except Exception:
                log.exception(
                    "chat_end failed; stream completed but persist incomplete"
                )
            yield {"event": "done", "data": final_result}
        else:
            yield event
