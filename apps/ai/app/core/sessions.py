"""AI chat session + message persistence — port of AiRepository.{createSession,
saveMessage,getSessionMessages}. The chat flow (Phase C) writes user/assistant
turns here; attachments JSONB carries invoiceDraft / artifact / provider."""

import json

from app.core.database import fetch, fetchrow
from app.core.ids import new_id
from app.core.serde import row_to_dict


async def create_session(workspace_id: str, title: str) -> dict:
    row = await fetchrow(
        "INSERT INTO ai_sessions (id, workspace_id, title) VALUES ($1, $2, $3) RETURNING *",
        new_id(),
        workspace_id,
        title,
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


async def get_session(session_id: str, workspace_id: str) -> dict | None:
    row = await fetchrow(
        """
        SELECT * FROM ai_sessions
        WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
        LIMIT 1
        """,
        session_id,
        workspace_id,
    )
    return row_to_dict(row)


async def get_session_messages(
    session_id: str, workspace_id: str, limit: int = 20
) -> list[dict]:
    # Last `limit` messages, oldest-first. Unbounded history gets resent to
    # the LLM on every tool-loop step — O(n²) input tokens per session. Matches
    # AiRepository.getSessionMessages (apps/api).
    rows = await fetch(
        """
        SELECT * FROM ai_messages
        WHERE session_id = $1 AND workspace_id = $2 AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT $3
        """,
        session_id,
        workspace_id,
        limit,
    )
    return [row_to_dict(r) for r in reversed(rows)]


async def update_title(session_id: str, workspace_id: str, title: str) -> None:
    await fetchrow(
        "UPDATE ai_sessions SET title = $3 WHERE id = $1 AND workspace_id = $2",
        session_id,
        workspace_id,
        title,
    )
