"""Wallet + wallet-group CRUD and set_default_wallet — port of
WalletsService.{create,update,delete,setDefaultWallet} and
WalletGroupsService (apps/api)."""

from app.core import audit
from app.core.database import fetchrow, transaction
from app.core.ids import new_id
from app.core.serde import row_to_dict


async def create_wallet(
    workspace_id: str, user_id: str, name: str, balance: float = 0,
    is_included_in_totals: bool = True, group_id: str | None = None,
) -> dict:
    wallet_id = new_id()
    async with transaction() as conn:
        row = await conn.fetchrow(
            "INSERT INTO wallets (id, workspace_id, group_id, name, balance, is_included_in_totals) "
            "VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
            wallet_id, workspace_id, group_id, name, balance, is_included_in_totals,
        )
        wallet = row_to_dict(row)
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="wallet.created",
            entity="wallet", entity_id=wallet_id, after=wallet, conn=conn,
        )
    return {"success": True, "data": wallet}


async def update_wallet(workspace_id: str, user_id: str, wallet_id: str, fields: dict) -> dict:
    before = await fetchrow(
        "SELECT * FROM wallets WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        wallet_id, workspace_id,
    )
    if before is None:
        return {"success": False, "error": "Wallet not found"}
    before = row_to_dict(before)

    sets, args, i = [], [], 1
    for col in ("name", "balance", "is_included_in_totals", "group_id"):
        if fields.get(col) is None:
            continue
        sets.append(f"{col} = ${i}")
        args.append(fields[col])
        i += 1
    if not sets:
        return {"success": True, "data": before}
    sets.append("updated_at = now()")

    async with transaction() as conn:
        args2 = [*args, wallet_id, workspace_id]
        row = await conn.fetchrow(
            f"UPDATE wallets SET {', '.join(sets)} "
            f"WHERE id = ${i} AND workspace_id = ${i + 1} AND deleted_at IS NULL RETURNING *",
            *args2,
        )
        updated = row_to_dict(row)
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="wallet.updated",
            entity="wallet", entity_id=wallet_id, before=before, after=updated, conn=conn,
        )
    return {"success": True, "data": updated}


async def delete_wallet(workspace_id: str, user_id: str, wallet_id: str) -> dict:
    before = await fetchrow(
        "SELECT * FROM wallets WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        wallet_id, workspace_id,
    )
    if before is None:
        return {"success": False, "error": "Wallet not found"}
    before = row_to_dict(before)

    async with transaction() as conn:
        await conn.execute(
            "UPDATE wallets SET deleted_at = now() WHERE id = $1 AND workspace_id = $2",
            wallet_id, workspace_id,
        )
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="wallet.deleted",
            entity="wallet", entity_id=wallet_id, before=before, conn=conn,
        )
    return {"success": True, "data": None}


async def create_wallet_group(workspace_id: str, user_id: str, name: str) -> dict:
    group_id = new_id()
    async with transaction() as conn:
        row = await conn.fetchrow(
            "INSERT INTO wallet_groups (id, workspace_id, name) VALUES ($1, $2, $3) RETURNING *",
            group_id, workspace_id, name,
        )
        group = row_to_dict(row)
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="wallet_group.created",
            entity="wallet_group", entity_id=group_id, after=group, conn=conn,
        )
    return {"success": True, "data": group}


async def update_wallet_group(workspace_id: str, user_id: str, group_id: str, name: str) -> dict:
    before = await fetchrow(
        "SELECT * FROM wallet_groups WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        group_id, workspace_id,
    )
    if before is None:
        return {"success": False, "error": "Wallet group not found"}
    before = row_to_dict(before)

    async with transaction() as conn:
        row = await conn.fetchrow(
            "UPDATE wallet_groups SET name = $1, updated_at = now() "
            "WHERE id = $2 AND workspace_id = $3 AND deleted_at IS NULL RETURNING *",
            name, group_id, workspace_id,
        )
        updated = row_to_dict(row)
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="wallet_group.updated",
            entity="wallet_group", entity_id=group_id, before=before, after=updated, conn=conn,
        )
    return {"success": True, "data": updated}


async def delete_wallet_group(workspace_id: str, user_id: str, group_id: str) -> dict:
    before = await fetchrow(
        "SELECT * FROM wallet_groups WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        group_id, workspace_id,
    )
    if before is None:
        return {"success": False, "error": "Wallet group not found"}
    before = row_to_dict(before)

    async with transaction() as conn:
        # Soft-deleting the group doesn't trigger the DB's onDelete:set null
        # (that only fires on a hard delete) — un-group member wallets here.
        await conn.execute(
            "UPDATE wallets SET group_id = NULL, updated_at = now() "
            "WHERE group_id = $1 AND workspace_id = $2",
            group_id, workspace_id,
        )
        await conn.execute(
            "UPDATE wallet_groups SET deleted_at = now() WHERE id = $1 AND workspace_id = $2",
            group_id, workspace_id,
        )
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="wallet_group.deleted",
            entity="wallet_group", entity_id=group_id, before=before, conn=conn,
        )
    return {"success": True, "data": None}


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
