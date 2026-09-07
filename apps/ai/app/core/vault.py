"""System-bucket-only R2 upload for the receipt-image vault-upload side effect —
port of VaultService.uploadFile (apps/api/modules/vault/vault.service.ts),
scoped down: no per-workspace custom R2 credentials (would need at-rest-crypto.ts
decryption ported too — separate follow-up), no vault_files hard-delete /
inactive-file lifecycle (unrelated to the chat upload path).

Ports: storage-quota check, SHA-256 dedup lookup, the actual PUT, and the
vault_files row insert. Best-effort/non-blocking by contract — callers (draft.py)
wrap this in try/except and continue on failure, same as TS.
"""

import hashlib
import json
from functools import lru_cache

import boto3
from botocore.client import Config

from app.config import get_settings
from app.core.database import execute, fetchrow
from app.core.ids import new_id
from app.core.serde import row_to_dict


class VaultNotConfigured(Exception):
    pass


@lru_cache
def _client():
    s = get_settings()
    if not (s.BUCKET_ENDPOINT and s.BUCKET_ACCESS_KEY_ID and s.BUCKET_SECRET_ACCESS_KEY and s.BUCKET_NAME):
        raise VaultNotConfigured("system bucket storage not configured")
    return boto3.client(
        "s3",
        endpoint_url=s.BUCKET_ENDPOINT,
        aws_access_key_id=s.BUCKET_ACCESS_KEY_ID,
        aws_secret_access_key=s.BUCKET_SECRET_ACCESS_KEY,
        region_name=s.BUCKET_REGION,
        config=Config(s3={"addressing_style": "path"}, signature_version="s3v4"),
    )


async def _get_usage_and_quota(workspace_id: str) -> dict | None:
    row = await fetchrow(
        """
        SELECT w.vault_size_used_bytes AS used,
               w.extra_vault_size_mb   AS extra,
               p.max_vault_size_mb     AS max_mb
        FROM workspaces w
        LEFT JOIN pricing p ON w.plan_id = p.id
        WHERE w.id = $1
        LIMIT 1
        """,
        workspace_id,
    )
    if row is None:
        return None
    addon = await fetchrow(
        """
        SELECT COALESCE(SUM(p.max_vault_size_mb), 0) AS extra
        FROM workspace_addons wa
        JOIN pricing p ON wa.addon_id = p.id
        WHERE wa.workspace_id = $1
          AND wa.status = 'active'
          AND p.addon_type = 'vault'
          AND wa.deleted_at IS NULL
        """,
        workspace_id,
    )
    recurring_extra = int(addon["extra"]) if addon else 0
    return {
        "used": int(row["used"] or 0),
        "max_mb": int(row["max_mb"] or 0) + int(row["extra"] or 0) + recurring_extra,
    }


async def _find_existing_by_fingerprint(
    workspace_id: str, sha256: str, size: int, mime_type: str
) -> dict | None:
    row = await fetchrow(
        """
        SELECT * FROM vault_files
        WHERE workspace_id = $1 AND size = $2 AND type = $3 AND deleted_at IS NULL
          AND (metadata)::jsonb ->> 'sha256' = $4
        ORDER BY created_at DESC
        LIMIT 1
        """,
        workspace_id,
        size,
        mime_type,
        sha256,
    )
    return row_to_dict(row)


async def upload_receipt_attachment(
    workspace_id: str, name: str, mime_type: str, data: bytes
) -> str | None:
    """Uploads one receipt image to the system bucket, checking vault storage
    quota and SHA-256 dedup first. Returns the new (or deduplicated) vault_files
    id, or None if the vault storage quota would be exceeded or the workspace
    doesn't exist. Raises on genuine failures (bucket not configured, S3 error,
    DB error) — callers must catch and treat this as best-effort, matching TS.
    """
    usage = await _get_usage_and_quota(workspace_id)
    if usage is None:
        return None

    max_mb = usage["max_mb"] or 100
    max_bytes = max_mb * 1024 * 1024
    sha256 = hashlib.sha256(data).hexdigest()
    size = len(data)

    existing = await _find_existing_by_fingerprint(workspace_id, sha256, size, mime_type)
    is_deduplicated = existing is not None
    additional_bytes = 0 if is_deduplicated else size

    if usage["used"] + additional_bytes > max_bytes:
        return None

    safe_name = "".join(c if c.isalnum() or c == "." else "-" for c in name)
    key = existing["key"] if existing else f"vault/{workspace_id}/{sha256}-{safe_name}"

    if not existing:
        _client().put_object(Bucket=get_settings().BUCKET_NAME, Key=key, Body=data, ContentType=mime_type)

    metadata = json.dumps({"sha256": sha256, "deduplicated": is_deduplicated, "originalName": name})
    row = await fetchrow(
        """
        INSERT INTO vault_files (id, workspace_id, name, key, size, type, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        """,
        new_id(),
        workspace_id,
        name,
        key,
        size,
        mime_type,
        metadata,
    )
    vault_entry = row_to_dict(row)
    if vault_entry is None:
        return None

    if additional_bytes > 0:
        await execute(
            "UPDATE workspaces SET vault_size_used_bytes = GREATEST(0, vault_size_used_bytes + $2) WHERE id = $1",
            workspace_id,
            additional_bytes,
        )

    return vault_entry["id"]
