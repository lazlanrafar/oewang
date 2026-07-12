"""Debt writes for the AI money path — create_debt + split_bill (contact upsert,
receivable debts, optional primary expense). Port of DebtsService.{createDebt,
splitBill}. Notifications/realtime dropped (see transactions.py note).
"""

from datetime import datetime, timezone
from decimal import Decimal

from app.core import audit
from app.core.database import fetchrow, transaction
from app.core.ids import new_id
from app.core.serde import row_to_dict
from app.modules.execution.resolvers import parse_amount


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
