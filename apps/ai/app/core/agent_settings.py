"""Per-workspace agent settings — port of AgentSettingsRepository.getOrCreate
(apps/api/modules/ai/agent-settings.repository.ts). No cache (unlike the TS
5-minute Redis cache) — apps/ai has no Redis client; one query per chat turn is
accepted as a deliberate simplification, matching the auth-cache precedent.
"""

from app.core.database import fetchrow
from app.core.ids import new_id
from app.core.serde import row_to_dict

_DEFAULTS = {
    "model": "gpt-4o-mini",
    "temperature": "0.70",
    "max_steps": 10,
    "custom_instructions": None,
    "response_language": "auto",
}


async def get_or_create(workspace_id: str) -> dict:
    row = await fetchrow(
        "SELECT * FROM ai_agent_settings WHERE workspace_id = $1 LIMIT 1",
        workspace_id,
    )
    if row is not None:
        return row_to_dict(row)

    row = await fetchrow(
        """
        INSERT INTO ai_agent_settings
          (id, workspace_id, model, temperature, max_steps, custom_instructions, response_language)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        """,
        new_id(),
        workspace_id,
        _DEFAULTS["model"],
        _DEFAULTS["temperature"],
        _DEFAULTS["max_steps"],
        _DEFAULTS["custom_instructions"],
        _DEFAULTS["response_language"],
    )
    return row_to_dict(row)
