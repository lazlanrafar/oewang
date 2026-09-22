"""Owner-scoped conversation history. Never use shared history as user memory."""

from app.core.sessions import get_session_messages


async def load_history(
    session_id: str, workspace_id: str, user_id: str, limit: int = 10
) -> list[dict]:
    rows = await get_session_messages(session_id, workspace_id, user_id, limit)
    return [
        {"role": r["role"], "content": r["content"]}
        for r in rows
        if r["role"] in ("user", "assistant")
    ]
