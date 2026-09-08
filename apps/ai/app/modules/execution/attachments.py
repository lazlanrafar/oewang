"""get_receipt_attachment — hands back a presigned URL for a receipt already
attached to a transaction, so the model can resend it as a chat attachment
(see executor.py's file-attachment artifact rule)."""

from app.core.database import fetchrow
from app.core.vault import get_file_url


async def get_receipt_attachment(workspace_id: str, transaction_id: str) -> dict:
    row = await fetchrow(
        """
        SELECT ta.vault_file_id
        FROM transaction_attachments ta
        WHERE ta.workspace_id = $1 AND ta.transaction_id = $2 AND ta.deleted_at IS NULL
        ORDER BY ta.created_at DESC
        LIMIT 1
        """,
        workspace_id,
        transaction_id,
    )
    if row is None:
        return {"success": False, "error": "No receipt is attached to that transaction."}

    file = await get_file_url(workspace_id, row["vault_file_id"])
    if file is None:
        return {"success": False, "error": "No receipt is attached to that transaction."}

    return {"success": True, "data": file}
