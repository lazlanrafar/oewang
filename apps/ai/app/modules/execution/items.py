"""Transaction line items + recall: add_transaction_items (write), and the
read-only search_transaction_items / recall_transaction helpers.
"""

from collections import Counter
from decimal import Decimal

from app.config import get_settings
from app.core import audit
from app.core.database import fetch, transaction
from app.core.ids import new_id
from app.core.serde import row_to_dict, to_jsonable


async def add_transaction_items(
    workspace_id: str, user_id: str, transaction_id: str, items: list[dict]
) -> dict:
    if get_settings().RECEIPT_DRY_RUN:
        return {
            "success": True,
            "dryRun": True,
            "preview": {
                "transactionId": transaction_id or "[dry-run-id]",
                "items": [{**it, "id": f"[dry-run-item-{i}]", "note": "[DRY RUN] Item NOT saved."}
                          for i, it in enumerate(items)],
                "note": "[DRY RUN] Items NOT saved. Set RECEIPT_DRY_RUN=false to persist.",
            },
        }

    created = []
    async with transaction() as conn:
        # Tenant isolation: the LLM supplies transaction_id/categoryId, so never
        # trust them. The parent transaction MUST belong to this workspace, and
        # any category id must too (foreign ids are dropped, not written).
        owns_txn = await conn.fetchrow(
            "SELECT id FROM transactions WHERE id = $1 AND workspace_id = $2 "
            "AND deleted_at IS NULL",
            transaction_id, workspace_id,
        )
        if not owns_txn:
            raise ValueError("transaction not found in workspace")
        valid_cats = {
            r["id"]
            for r in await conn.fetch(
                "SELECT id FROM categories WHERE workspace_id = $1 "
                "AND deleted_at IS NULL",
                workspace_id,
            )
        }
        for it in items:
            category_id = it.get("categoryId")
            if category_id not in valid_cats:
                category_id = None
            row = await conn.fetchrow(
                """
                INSERT INTO transaction_items
                  (id, workspace_id, transaction_id, name, brand, quantity, unit,
                   unit_price, amount, category_id, notes)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                RETURNING *
                """,
                new_id(), workspace_id, transaction_id, it["name"], it.get("brand"),
                _dec(it.get("quantity")), it.get("unit"), _dec(it.get("unitPrice")),
                _dec(it.get("amount")), category_id, it.get("notes"),
            )
            created.append(row_to_dict(row))
        await audit.log(
            workspace_id=workspace_id, user_id=user_id,
            action="transaction_items.bulk_created", entity="transaction_item",
            entity_id=transaction_id, after=created, conn=conn,
        )
    return {"success": True, "data": created}


def _dec(v):
    return Decimal(str(v)) if v is not None else None


async def search_transaction_items(workspace_id: str, query: str, limit: int = 10) -> dict:
    rows = await fetch(
        """
        SELECT ti.id, ti.name, ti.brand, ti.quantity, ti.unit, ti.unit_price,
               ti.amount, t.date, t.name AS transaction_name
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        WHERE ti.workspace_id = $1 AND ti.deleted_at IS NULL
          AND t.deleted_at IS NULL
          AND (ti.name ILIKE $2 OR ti.brand ILIKE $2)
        ORDER BY t.date DESC
        LIMIT $3
        """,
        workspace_id,
        f"%{query}%",
        limit,
    )
    return {"success": True, "data": [row_to_dict(r) for r in rows]}


async def recall_transaction(workspace_id: str, query: str, limit: int = 5) -> dict:
    """Infer the usual price/wallet/category for a brief 'buy X' phrase from past
    expense transactions. Lean port of aggregateRecall."""
    rows = await fetch(
        """
        SELECT amount, wallet_id, category_id, date, name
        FROM transactions
        WHERE workspace_id = $1 AND deleted_at IS NULL AND type = 'expense'
          AND name ILIKE $2
        ORDER BY date DESC
        LIMIT 30
        """,
        workspace_id,
        f"%{query}%",
    )
    if not rows:
        return {"success": True, "data": {"suggestions": []}}

    amounts = [float(r["amount"]) for r in rows]
    usual_wallet = Counter(r["wallet_id"] for r in rows if r["wallet_id"]).most_common(1)
    usual_cat = Counter(r["category_id"] for r in rows if r["category_id"]).most_common(1)
    suggestion = {
        "query": query,
        "count": len(rows),
        "lastPrice": amounts[0],
        "averagePrice": round(sum(amounts) / len(amounts), 2),
        "usualWalletId": usual_wallet[0][0] if usual_wallet else None,
        "usualCategoryId": usual_cat[0][0] if usual_cat else None,
        "recent": [to_jsonable({"name": r["name"], "amount": r["amount"], "date": r["date"]})
                   for r in rows[:limit]],
    }
    return {"success": True, "data": {"suggestions": [suggestion]}}
