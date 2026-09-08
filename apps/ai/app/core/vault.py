"""System-bucket-only R2 upload for the receipt-image vault-upload side effect —
port of VaultService.uploadFile (apps/api/modules/vault/vault.service.ts),
scoped down: no per-workspace custom R2 credentials (would need at-rest-crypto.ts
decryption ported too — separate follow-up), no vault_files hard-delete /
inactive-file lifecycle (unrelated to the chat upload path).

Ports: storage-quota check, SHA-256 dedup lookup, the actual PUT, and the
vault_files row insert. Best-effort/non-blocking by contract — callers (draft.py)
wrap this in try/except and continue on failure, same as TS.
"""

import base64
import hashlib
import json
from functools import lru_cache

import boto3
from botocore.client import Config

from app.config import get_settings
from app.core import audit
from app.core.database import execute, fetch, fetchrow, transaction
from app.core.ids import new_id
from app.core.serde import row_to_dict
from app.utils.logger import get_logger

log = get_logger("ai.vault")


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


async def get_file_url(workspace_id: str, vault_file_id: str) -> dict | None:
    """Presigned, time-limited GET URL for a vault_files row — used to hand a
    stored file (a receipt, or a just-generated export) back to the model as
    a chat attachment without ever routing the bytes through this process."""
    row = await fetchrow(
        "SELECT name, key, type FROM vault_files "
        "WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        vault_file_id,
        workspace_id,
    )
    if row is None:
        return None
    url = _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": get_settings().BUCKET_NAME, "Key": row["key"]},
        ExpiresIn=3600,
    )
    return {"url": url, "name": row["name"], "mime_type": row["type"]}


async def list_files(workspace_id: str, query: str | None = None, limit: int = 20) -> dict:
    """Mirrors VaultRepository.findMany's filter set: not deleted, not
    hidden during a storage-violation grace period (`inactive_at`),
    optional name search."""
    if query:
        rows = await fetch(
            "SELECT id, name, type, size, created_at FROM vault_files "
            "WHERE workspace_id = $1 AND deleted_at IS NULL AND inactive_at IS NULL "
            "AND name ILIKE $2 ORDER BY created_at DESC LIMIT $3",
            workspace_id, f"%{query}%", limit,
        )
    else:
        rows = await fetch(
            "SELECT id, name, type, size, created_at FROM vault_files "
            "WHERE workspace_id = $1 AND deleted_at IS NULL AND inactive_at IS NULL "
            "ORDER BY created_at DESC LIMIT $2",
            workspace_id, limit,
        )
    return {
        "success": True,
        "data": [
            {"id": r["id"], "name": r["name"], "type": r["type"], "size": r["size"],
             "created_at": r["created_at"].isoformat() if r["created_at"] else None}
            for r in rows
        ],
    }


async def rename_file(workspace_id: str, user_id: str, vault_file_id: str, new_name: str) -> dict:
    before = await fetchrow(
        "SELECT * FROM vault_files WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        vault_file_id, workspace_id,
    )
    if before is None:
        return {"success": False, "error": "File not found"}
    before = row_to_dict(before)

    async with transaction() as conn:
        row = await conn.fetchrow(
            "UPDATE vault_files SET name = $1, updated_at = now() "
            "WHERE id = $2 AND workspace_id = $3 AND deleted_at IS NULL RETURNING *",
            new_name, vault_file_id, workspace_id,
        )
        updated = row_to_dict(row)
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="vault.file_renamed",
            entity="vault_file", entity_id=vault_file_id, before=before, after=updated, conn=conn,
        )
    return {"success": True, "data": updated}


async def delete_file(workspace_id: str, user_id: str, vault_file_id: str) -> dict:
    """Soft-deletes the row; only removes the R2 blob and decrements
    `vault_size_used_bytes` if no other non-deleted row still shares the
    same dedup `key` — mirrors VaultService.deleteFile exactly."""
    before = await fetchrow(
        "SELECT * FROM vault_files WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        vault_file_id, workspace_id,
    )
    if before is None:
        return {"success": False, "error": "File not found"}
    before = row_to_dict(before)

    async with transaction() as conn:
        await conn.execute(
            "UPDATE vault_files SET deleted_at = now() WHERE id = $1 AND workspace_id = $2",
            vault_file_id, workspace_id,
        )
        other = await conn.fetchrow(
            "SELECT id FROM vault_files WHERE workspace_id = $1 AND key = $2 AND deleted_at IS NULL LIMIT 1",
            workspace_id, before["key"],
        )
        if other is None:
            try:
                _client().delete_object(Bucket=get_settings().BUCKET_NAME, Key=before["key"])
            except Exception:  # noqa: BLE001 — row is already soft-deleted; an orphaned blob is recoverable, a rolled-back delete isn't
                log.warning("Failed to delete R2 blob for vault_file=%s key=%s", vault_file_id, before["key"], exc_info=True)
            await conn.execute(
                "UPDATE workspaces SET vault_size_used_bytes = GREATEST(0, vault_size_used_bytes - $2) WHERE id = $1",
                workspace_id, before["size"],
            )
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="vault.file_deleted",
            entity="vault_file", entity_id=vault_file_id, before=before, conn=conn,
        )
    return {"success": True, "data": None}


async def save_chat_attachment(workspace_id: str, user_id: str, attachment: dict) -> dict:
    """Standalone chat-initiated vault save (not a receipt draft side effect)
    — thin wrapper over the already-generic upload_receipt_attachment, plus
    its own audit entry since this is a distinct user-initiated action."""
    data = base64.b64decode(attachment["data"])
    vault_file_id = await upload_receipt_attachment(
        workspace_id, attachment["name"], attachment["type"], data
    )
    if vault_file_id is None:
        return {"success": False, "error": f'Could not save "{attachment.get("name")}" (storage quota reached)'}

    await audit.log(
        workspace_id=workspace_id, user_id=user_id, action="vault.file_uploaded",
        entity="vault_file", entity_id=vault_file_id, after={"name": attachment.get("name")},
    )
    return {"success": True, "data": {"vault_file_id": vault_file_id, "name": attachment.get("name")}}
