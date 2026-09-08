"""Debt writes for the AI money path — create_debt + split_bill (contact upsert,
receivable debts, optional primary expense), plus pay_debt/update_debt/delete_debt.
Port of DebtsService.{createDebt,splitBill,payDebt,updateDebt,deleteDebt}.
Notifications/realtime dropped (see transactions.py note).
"""

from datetime import datetime, timezone
from decimal import Decimal

from app.core import audit
from app.core.database import fetchrow, transaction
from app.core.ids import new_id
from app.core.serde import row_to_dict
from app.modules.execution.resolvers import parse_amount, resolve_wallet_id
from app.modules.execution.transactions import _apply_delta_sign, _update_balance


def _derive_debt_status(remaining: Decimal, amount: Decimal) -> str:
    """Port of the status re-derivation in DebtsService.{payDebt,updateDebt}."""
    if remaining <= 0:
        return "paid"
    if remaining < amount:
        return "partial"
    return "unpaid"


async def _find_or_create_contact(conn, workspace_id: str, name: str) -> dict:
    row = await conn.fetchrow(
        "SELECT * FROM contacts WHERE workspace_id = $1 AND lower(name) = lower($2) "
        "AND deleted_at IS NULL LIMIT 1",
        workspace_id,
        name,
    )
    if row is not None:
        return row_to_dict(row)
    row = await conn.fetchrow(
        "INSERT INTO contacts (id, workspace_id, name) VALUES ($1, $2, $3) RETURNING *",
        new_id(),
        workspace_id,
        name,
    )
    return row_to_dict(row)


async def _insert_debt(conn, **d) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO debts
          (id, workspace_id, contact_id, source_transaction_id, type, origin,
           amount, remaining_amount, status, description, due_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'unpaid',$9,$10::text::timestamp)
        RETURNING *
        """,
        new_id(),
        d["workspace_id"],
        d["contact_id"],
        d.get("source_transaction_id"),
        d["type"],
        d["origin"],
        d["amount"],
        d["remaining_amount"],
        d.get("description"),
        d.get("due_date"),
    )
    return row_to_dict(row)


async def create_debt(workspace_id: str, user_id: str, body: dict) -> dict:
    """body: contactName, type ('payable'|'receivable'), amount, description?, dueDate?."""
    amount = parse_amount(body["amount"])
    async with transaction() as conn:
        contact = await _find_or_create_contact(conn, workspace_id, body["contactName"])
        debt = await _insert_debt(
            conn,
            workspace_id=workspace_id,
            contact_id=contact["id"],
            type=body["type"],
            origin="manual",
            amount=amount,
            remaining_amount=amount,
            description=body.get("description"),
            due_date=body.get("dueDate"),
        )
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="debt.created",
            entity="debt", entity_id=debt["id"], after=debt, conn=conn,
        )
    return {"success": True, "data": debt}


async def split_bill(workspace_id: str, user_id: str, body: dict) -> dict:
    """body: amount, name, wallet_id (resolved), category_id (resolved), contactNames[]."""
    total = parse_amount(body["amount"])
    names = body.get("contactNames") or []
    num_people = len(names) + 1  # + the user
    split_amount = (total / num_people).quantize(Decimal("0.01"))

    async with transaction() as conn:
        source_tx_id = None
        wallet_id = body.get("wallet_id")
        if wallet_id:
            tx = await conn.fetchrow(
                """
                INSERT INTO transactions
                  (id, workspace_id, wallet_id, category_id, assigned_user_id,
                   amount, date, type, name)
                VALUES ($1,$2,$3,$4,$5,$6,$7::text::timestamp,'expense',$8)
                RETURNING id
                """,
                new_id(), workspace_id, wallet_id, body.get("category_id"), user_id,
                total, datetime.now(timezone.utc).isoformat(), body.get("name"),
            )
            source_tx_id = tx["id"]
            await conn.execute(
                "UPDATE wallets SET balance = balance - $3, updated_at = now() "
                "WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
                wallet_id, workspace_id, total,
            )

        created = []
        for name in names:
            contact = await _find_or_create_contact(conn, workspace_id, name)
            debt = await _insert_debt(
                conn,
                workspace_id=workspace_id,
                contact_id=contact["id"],
                type="receivable",
                origin="from_transaction" if source_tx_id else "manual",
                amount=split_amount,
                remaining_amount=split_amount,
                source_transaction_id=source_tx_id,
                description=f"Split for {body.get('name')}",
            )
            created.append(debt)

        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="debt.split_bill",
            entity="debt", entity_id=source_tx_id or "00000000-0000-0000-0000-000000000000",
            after={"sourceTxId": source_tx_id, "splitAmount": float(split_amount),
                   "createdDebts": created}, conn=conn,
        )

    return {"success": True, "data": {"sourceTxId": source_tx_id, "createdDebts": created}}


async def pay_debt(workspace_id: str, user_id: str, debt_id: str, amount, wallet_id: str | None = None) -> dict:
    before = await fetchrow(
        "SELECT * FROM debts WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        debt_id, workspace_id,
    )
    if before is None:
        return {"success": False, "error": "Debt not found"}
    before = row_to_dict(before)

    pay_amount = parse_amount(amount)
    remaining = Decimal(str(before["remaining_amount"]))
    if pay_amount <= 0 or pay_amount > remaining:
        return {"success": False, "error": f"Payment must be greater than 0 and at most the remaining amount ({remaining})"}

    resolved_wallet_id = await resolve_wallet_id(workspace_id, wallet_id)
    new_remaining = remaining - pay_amount
    status = _derive_debt_status(new_remaining, Decimal(str(before["amount"])))

    async with transaction() as conn:
        tx_id = None
        if resolved_wallet_id:
            t_type = "expense" if before["type"] == "payable" else "income"
            tx = await conn.fetchrow(
                "INSERT INTO transactions (id, workspace_id, wallet_id, assigned_user_id, amount, date, type, name, description) "
                "VALUES ($1,$2,$3,$4,$5,now(),$6,$7,$8) RETURNING id",
                new_id(), workspace_id, resolved_wallet_id, user_id, pay_amount, t_type,
                "Debt payment", before.get("description") or "Debt payment",
            )
            tx_id = tx["id"]
            await _update_balance(conn, resolved_wallet_id, workspace_id, _apply_delta_sign(t_type, pay_amount))

        await conn.execute(
            "INSERT INTO debt_payments (id, workspace_id, debt_id, transaction_id, amount) "
            "VALUES ($1, $2, $3, $4, $5)",
            new_id(), workspace_id, debt_id, tx_id, pay_amount,
        )
        row = await conn.fetchrow(
            "UPDATE debts SET remaining_amount = $1, status = $2, updated_at = now() "
            "WHERE id = $3 AND workspace_id = $4 RETURNING *",
            new_remaining, status, debt_id, workspace_id,
        )
        updated = row_to_dict(row)
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="debt.paid",
            entity="debt", entity_id=debt_id, before=before, after=updated, conn=conn,
        )
    return {"success": True, "data": updated}


async def update_debt(workspace_id: str, user_id: str, debt_id: str, fields: dict) -> dict:
    before = await fetchrow(
        "SELECT * FROM debts WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        debt_id, workspace_id,
    )
    if before is None:
        return {"success": False, "error": "Debt not found"}
    before = row_to_dict(before)

    sets, args, i = [], [], 1
    if fields.get("amount") is not None:
        old_amount = Decimal(str(before["amount"]))
        old_remaining = Decimal(str(before["remaining_amount"]))
        new_amount = parse_amount(fields["amount"])
        new_remaining = max(Decimal("0"), old_remaining + (new_amount - old_amount))
        sets.append(f"amount = ${i}"); args.append(new_amount); i += 1
        sets.append(f"remaining_amount = ${i}"); args.append(new_remaining); i += 1
        sets.append(f"status = ${i}"); args.append(_derive_debt_status(new_remaining, new_amount)); i += 1
    if fields.get("description") is not None:
        sets.append(f"description = ${i}"); args.append(fields["description"]); i += 1
    if fields.get("dueDate") is not None:
        sets.append(f"due_date = ${i}::text::timestamp"); args.append(fields["dueDate"]); i += 1

    if not sets:
        return {"success": True, "data": before}
    sets.append("updated_at = now()")

    async with transaction() as conn:
        args2 = [*args, debt_id, workspace_id]
        row = await conn.fetchrow(
            f"UPDATE debts SET {', '.join(sets)} "
            f"WHERE id = ${i} AND workspace_id = ${i + 1} AND deleted_at IS NULL RETURNING *",
            *args2,
        )
        updated = row_to_dict(row)
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="debt.updated",
            entity="debt", entity_id=debt_id, before=before, after=updated, conn=conn,
        )
    return {"success": True, "data": updated}


async def delete_debt(workspace_id: str, user_id: str, debt_id: str) -> dict:
    before = await fetchrow(
        "SELECT * FROM debts WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        debt_id, workspace_id,
    )
    if before is None:
        return {"success": False, "error": "Debt not found"}
    before = row_to_dict(before)

    async with transaction() as conn:
        await conn.execute(
            "UPDATE debts SET deleted_at = now() WHERE id = $1 AND workspace_id = $2",
            debt_id, workspace_id,
        )
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="debt.deleted",
            entity="debt", entity_id=debt_id, before=before, conn=conn,
        )
    return {"success": True, "data": None}
