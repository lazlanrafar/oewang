import logging

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


async def chat(
    message: str, workspace_id: str, user_id: str | None, session_id: str | None
) -> dict:
    balance = await _balance(workspace_id)
    txns = await _recent_transactions(workspace_id)
    currency = await get_currency_settings(workspace_id)
    history = await load_history(session_id, workspace_id) if session_id else []

    system = prompts.system_prompt(balance, txns, currency)
    messages = history + [{"role": "user", "content": message}]
    reply = llm.complete(system, messages)
    # Elysia owns ai_messages persistence; we just echo the session id back.
    return {"reply": reply, "session_id": session_id}


async def run_chat(
    system_prompt: str,
    history: list[dict],
    workspace_id: str,
    user_id: str,
) -> dict:
    """Service-to-service LLM tool loop for the WhatsApp/Telegram + in-process
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
    the reply and increments tokens. The last canvas an analysis tool returns
    becomes `artifact`. Raises tools.ApiError for quota/auth (forwarded by route).
    """
    begin = await tools.chat_begin(token, messages, session_id, web_search)

    # Receipt-draft turns already produced + persisted a reply in Elysia.
    if begin.get("kind") == "early":
        return {
            "session_id": begin["session_id"],
            "reply": begin["reply"],
            "usage": {"input_tokens": 0, "output_tokens": 0},
            "artifact": None,
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
        "artifact": result["artifact"],
        "provider": {"name": "openai", "response_id": result.get("response_id")},
    }
