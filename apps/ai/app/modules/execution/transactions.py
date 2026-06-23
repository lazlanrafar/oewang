"""Transaction writes for the AI money path — create / update / delete with
wallet-balance rebalancing, multicurrency, soft-delete and audit. Faithful port of
TransactionsService.{create,update,delete} (apps/api).

Dropped vs TS (not money-correctness): notifications, budget-exceeded alerts,
metrics/budget cache invalidation, realtime WS push. # ponytail: AI path doesn't
need the WS fan-out; clients refetch on the chat reply.
"""

from datetime import datetime, timezone
from decimal import Decimal

from app.config import get_settings
from app.core import audit
from app.core.database import fetchrow, transaction
from app.core.ids import new_id
from app.core.serde import row_to_dict
from app.modules.execution.resolvers import resolve_multicurrency

_INSERT = """
    INSERT INTO transactions
      (id, workspace_id, wallet_id, to_wallet_id, category_id, assigned_user_id,
       amount, original_amount, original_currency_code, exchange_rate,
       date, type, description, name)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamp,$12,$13,$14)
    RETURNING *
"""


async def _update_balance(conn, wallet_id: str, workspace_id: str, delta: Decimal):
    if not wallet_id or delta == 0:
        return
    await conn.execute(
        "UPDATE wallets SET balance = balance + $3, updated_at = now() "
        "WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        wallet_id,
        workspace_id,
        delta,
    )


def _apply_delta_sign(t_type: str, val: Decimal) -> Decimal:
    """Signed wallet delta for the *source* wallet on create (income +, expense −,
    transfer − from source)."""
    if t_type == "income":
        return val
    return -val  # expense or transfer-out


async def create_transaction(workspace_id: str, user_id: str, body: dict) -> dict:
    mc = resolve_multicurrency(body)
    amount = mc["amount"]
    t_type = body["type"]
    wallet_id = body.get("wallet_id") or ""
    to_wallet_id = body.get("to_wallet_id") or None
    category_id = body.get("category_id") or None
    date_str = body.get("date") or datetime.now(timezone.utc).isoformat()

    if get_settings().RECEIPT_DRY_RUN:
        return {
            "success": True,
            "dryRun": True,
            "preview": {
                "id": "[dry-run-id]",
                "workspace_id": workspace_id,
                "type": t_type,
                "amount": float(amount),
                "date": date_str,
                "name": body.get("name"),
                "wallet_id": wallet_id,
                "to_wallet_id": to_wallet_id,
                "category_id": category_id,
                "note": "[DRY RUN] Transaction NOT saved. Set RECEIPT_DRY_RUN=false to persist.",
            },
        }

    async with transaction() as conn:
        row = await conn.fetchrow(
            _INSERT,
            new_id(),
            workspace_id,
            wallet_id,
            to_wallet_id,
            category_id,
            body.get("assigned_user_id") or user_id,
            amount,
            mc["original_amount"],
            mc["original_currency_code"],
            mc["exchange_rate"],
            date_str,
            t_type,
            body.get("description"),
            body.get("name"),
        )
        tx = row_to_dict(row)

        if t_type == "transfer" and to_wallet_id:
            await _update_balance(conn, wallet_id, workspace_id, -amount)
            await _update_balance(conn, to_wallet_id, workspace_id, amount)
        else:
            await _update_balance(conn, wallet_id, workspace_id, _apply_delta_sign(t_type, amount))

        await audit.log(
            workspace_id=workspace_id,
            user_id=user_id,
            action="transaction.created",
            entity="transaction",
            entity_id=tx["id"],
            after=tx,
            conn=conn,
        )

    return {"success": True, "data": tx}


async def update_transaction(workspace_id: str, user_id: str, tx_id: str, body: dict) -> dict:
    before = await fetchrow(
        "SELECT * FROM transactions WHERE id = $1 AND workspace_id = $2 "
        "AND deleted_at IS NULL LIMIT 1",
        tx_id,
        workspace_id,
    )
    if before is None:
        return {"success": False, "error": "Transaction not found"}
    before = row_to_dict(before)

    old_val = Decimal(str(before["amount"]))
    t_type = before["type"]
    wallet_id = before["wallet_id"]
    to_wallet_id = before.get("to_wallet_id")

    # Re-derive amount if the model touched it (the AI update tool only exposes
    # amount/name/category/description — no currency switch — but handle amount).
    new_amount = old_val
    if body.get("amount") is not None:
        new_amount = resolve_multicurrency({"amount": body["amount"]})["amount"]

    sets, args, i = [], [], 1
    for col, key in (("amount", "_amount"), ("name", "name"),
                     ("category_id", "categoryId"), ("description", "description")):
        if col == "amount":
            if body.get("amount") is None:
                continue
            sets.append(f"amount = ${i}")
            args.append(new_amount)
        else:
            if body.get(key) is None:
                continue
            sets.append(f"{col} = ${i}")
            args.append(body[key])
        i += 1
    sets.append("updated_at = now()")

    async with transaction() as conn:
        # Reverse the old wallet impact, then apply the new amount's impact.
        if t_type == "transfer" and to_wallet_id:
            await _update_balance(conn, wallet_id, workspace_id, old_val)
            await _update_balance(conn, to_wallet_id, workspace_id, -old_val)
        else:
            await _update_balance(conn, wallet_id, workspace_id, -_apply_delta_sign(t_type, old_val))

        args2 = [*args, tx_id, workspace_id]
        row = await conn.fetchrow(
            f"UPDATE transactions SET {', '.join(sets)} "
            f"WHERE id = ${i} AND workspace_id = ${i + 1} AND deleted_at IS NULL RETURNING *",
            *args2,
        )
        updated = row_to_dict(row)
        new_val = Decimal(str(updated["amount"]))

        if t_type == "transfer" and to_wallet_id:
            await _update_balance(conn, wallet_id, workspace_id, -new_val)
            await _update_balance(conn, to_wallet_id, workspace_id, new_val)
        else:
            await _update_balance(conn, wallet_id, workspace_id, _apply_delta_sign(t_type, new_val))

        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="transaction.updated",
            entity="transaction", entity_id=tx_id, before=before, after=updated, conn=conn,
        )

    return {"success": True, "data": updated}


async def delete_transaction(workspace_id: str, user_id: str, tx_id: str) -> dict:
    before = await fetchrow(
        "SELECT * FROM transactions WHERE id = $1 AND workspace_id = $2 "
        "AND deleted_at IS NULL LIMIT 1",
        tx_id,
        workspace_id,
    )
    if before is None:
        return {"success": False, "error": "Transaction not found"}
    before = row_to_dict(before)

    val = Decimal(str(before["amount"]))
    t_type = before["type"]
    wallet_id = before["wallet_id"]
    to_wallet_id = before.get("to_wallet_id")

    async with transaction() as conn:
        await conn.execute(
            "UPDATE transactions SET deleted_at = now() WHERE id = $1 AND workspace_id = $2",
            tx_id,
            workspace_id,
        )
        # Reverse the wallet impact (opposite sign of create).
        if t_type == "transfer" and to_wallet_id:
            await _update_balance(conn, wallet_id, workspace_id, val)
            await _update_balance(conn, to_wallet_id, workspace_id, -val)
        else:
            await _update_balance(conn, wallet_id, workspace_id, -_apply_delta_sign(t_type, val))

        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="transaction.deleted",
            entity="transaction", entity_id=tx_id, before=before, conn=conn,
        )

    return {"success": True, "data": None}
