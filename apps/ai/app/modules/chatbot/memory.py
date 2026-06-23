from app.core.database import fetch


async def load_history(
    session_id: str, workspace_id: str, limit: int = 10
) -> list[dict]:
    """Last N user/assistant turns for a session, oldest-first. Read-only."""
    if not session_id:
        return []
    rows = await fetch(
        """
        SELECT role, content FROM ai_messages
        WHERE session_id = $1 AND workspace_id = $2 AND deleted_at IS NULL
          AND role IN ('user', 'assistant')
        ORDER BY created_at DESC
        LIMIT $3
        """,
        session_id,
        workspace_id,
        limit,
    )
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]
