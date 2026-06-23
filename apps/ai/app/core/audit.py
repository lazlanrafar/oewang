"""Append-only audit log — every AI mutation writes one row, mirroring
apps/api/modules/audit-logs. Never update/delete audit rows."""

import json

from app.core.database import execute
from app.core.ids import new_id
from app.core.serde import to_jsonable

# Keys whose values are redacted in before/after snapshots (mirror AuditLogsService).
_REDACT = ("password", "secret", "token", "api_key", "encryption_key")


def _sanitize(value):
    value = to_jsonable(value)
    if isinstance(value, dict):
        return {
            k: ("[REDACTED]" if k.lower() in _REDACT else _sanitize(v))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_sanitize(v) for v in value]
    return value


async def log(
    *,
    workspace_id: str,
    user_id: str,
    action: str,
    entity: str,
    entity_id: str,
    before=None,
    after=None,
    conn=None,
) -> None:
    before_json = json.dumps(_sanitize(before)) if before is not None else None
    after_json = json.dumps(_sanitize(after)) if after is not None else None
    sql = """
        INSERT INTO audit_logs (id, workspace_id, user_id, action, entity,
                                entity_id, before, after)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
    """
    args = (
        new_id(),
        workspace_id,
        user_id,
        action,
        entity,
        entity_id,
        before_json,
        after_json,
    )
    if conn is not None:
        await conn.execute(sql, *args)
    else:
        await execute(sql, *args)
