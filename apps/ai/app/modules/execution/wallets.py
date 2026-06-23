"""set_default_wallet — port of WalletsService.setDefaultWallet."""

from app.core import audit
from app.core.database import fetchrow, transaction
from app.core.serde import row_to_dict


async def set_default_wallet(workspace_id: str, user_id: str, wallet_id: str) -> dict:
    before = await fetchrow(
        "SELECT * FROM wallets WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        wallet_id,
        workspace_id,
    )
    if before is None:
        return {"success": False, "error": "Could not find a matching wallet to set as default."}
    before = row_to_dict(before)

    async with transaction() as conn:
        await conn.execute(
            "UPDATE wallets SET is_default = false, updated_at = now() "
            "WHERE workspace_id = $1 AND is_default = true AND deleted_at IS NULL",
            workspace_id,
        )
        row = await conn.fetchrow(
            "UPDATE wallets SET is_default = true, updated_at = now() "
            "WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL RETURNING *",
            wallet_id,
            workspace_id,
        )
        wallet = row_to_dict(row)
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="wallet.default_set",
            entity="wallet", entity_id=wallet_id, before=before, after=wallet, conn=conn,
        )
    return {"success": True, "data": wallet}
