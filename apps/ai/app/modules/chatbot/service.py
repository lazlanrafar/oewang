from app.core import llm
from app.core.currency import get_currency_settings
from app.core.database import fetch, fetchrow
from app.config import get_settings
from app.modules.chatbot import prompts, tools
from app.modules.chatbot.memory import load_history


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


async def web_chat(
    messages: list,
    workspace_id: str,
    user_id: str | None,
    session_id: str | None,
    web_search: bool,
) -> dict:
    """Website-shaped chat: full message array → rich contract with canvas.

    Phase 2: Python drives the LLM tool-calling loop; each tool call is forwarded
    to the Elysia internal endpoint (DB writes, audit logs, analytics + canvas
    rules stay in TS). The last canvas an analysis tool returns becomes `artifact`.
    Session persistence and quota still belong to Elysia (Phase 3); the website is
    not switched to this path until parity is proven (Phase 4).
    """
    system = await _web_system_prompt(workspace_id)
    convo = [
        {"role": m.role, "content": m.content}
        for m in messages
        if m.role in ("user", "assistant")
    ]

    async def run_tool(name: str, args: dict) -> dict:
        return await tools.execute_tool(name, args, workspace_id, user_id or "")

    result = await llm.complete_with_tools(
        system,
        convo,
        tools.WEB_TOOLS,
        run_tool,
        max_steps=get_settings().AI_MAX_STEPS,
    )
    return {
        "session_id": session_id,
        "reply": result["reply"],
        "usage": result["usage"],
        "artifact": result["artifact"],
        "provider": {"name": "openai", "response_id": result["response_id"]},
    }


async def _web_system_prompt(workspace_id: str) -> str:
    """Elysia builds the website prompt (single source of truth). Fall back to the
    local context-rich prompt if the call-back is unavailable."""
    try:
        prompt = await tools.get_system_prompt(workspace_id)
        if prompt:
            return prompt
    except Exception:
        pass
    balance = await _balance(workspace_id)
    txns = await _recent_transactions(workspace_id)
    currency = await get_currency_settings(workspace_id)
    return prompts.system_prompt(balance, txns, currency)
