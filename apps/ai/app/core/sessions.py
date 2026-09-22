"""AI chat session + message persistence — port of AiRepository.{createSession,
saveMessage,getSessionMessages}. The chat flow (Phase C) writes user/assistant
turns here; attachments JSONB carries invoiceDraft / artifact / provider."""

import json

from app.core.database import fetch, fetchrow
from app.core.ids import new_id
from app.core.serde import row_to_dict


async def create_session(workspace_id: str, title: str, user_id: str, *, personal_memory: bool = True) -> dict:
    row = await fetchrow(
        "INSERT INTO ai_sessions (id, workspace_id, title, user_id, personal_memory) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        new_id(),
        workspace_id,
        title,
        user_id,
        personal_memory,
    )
    return row_to_dict(row)


async def save_message(
    session_id: str,
    workspace_id: str,
    role: str,
    content: str,
    attachments=None,
) -> dict:
    row = await fetchrow(
        """
        INSERT INTO ai_messages (id, session_id, workspace_id, role, content, attachments)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING *
        """,
        new_id(),
        session_id,
        workspace_id,
        role,
        content,
        json.dumps(attachments) if attachments is not None else None,
    )
    return row_to_dict(row)


async def get_session(session_id: str, workspace_id: str, user_id: str) -> dict | None:
    row = await fetchrow(
        """
        SELECT * FROM ai_sessions
        WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
          AND (user_id = $3 OR user_id IS NULL)
        LIMIT 1
        """,
        session_id,
        workspace_id,
        user_id,
    )
    return row_to_dict(row)


async def get_session_messages(
    session_id: str, workspace_id: str, user_id: str, limit: int = 20
) -> list[dict]:
    # Last `limit` messages, oldest-first. Unbounded history gets resent to
    # the LLM on every tool-loop step — O(n²) input tokens per session. Matches
    # AiRepository.getSessionMessages (apps/api).
    rows = await fetch(
        """
        SELECT m.* FROM ai_messages m JOIN ai_sessions s ON s.id = m.session_id
        WHERE m.session_id = $1 AND m.workspace_id = $2 AND m.deleted_at IS NULL
          AND s.workspace_id = $2 AND s.deleted_at IS NULL
          AND (s.user_id = $4 OR s.user_id IS NULL)
        ORDER BY m.created_at DESC
        LIMIT $3
        """,
        session_id,
        workspace_id,
        limit,
        user_id,
    )
    return [row_to_dict(r) for r in reversed(rows)]


async def update_title(session_id: str, workspace_id: str, title: str, user_id: str) -> None:
    await fetchrow(
        "UPDATE ai_sessions SET title = $3 WHERE id = $1 AND workspace_id = $2 AND user_id = $4 AND deleted_at IS NULL",
        session_id,
        workspace_id,
        title,
        user_id,
    )


async def update_context(session_id: str, workspace_id: str, user_id: str, context: dict) -> None:
    await fetchrow("""UPDATE ai_sessions SET context = $4::jsonb, updated_at = now()
        WHERE id = $1 AND workspace_id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id""",
        session_id, workspace_id, user_id, json.dumps(context))
