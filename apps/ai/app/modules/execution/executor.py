"""execute_tool — the AI money path's single entry point. Dispatches a tool call to
the right read/write handler and attaches a canvas artifact when the analysis tools
cross their threshold. Replaces the Elysia /ai/internal/execute-tool callback: the
DB writes, audit, and artifact rules now live here in Python.

Returns {"result": <tool result>, "artifact": {"type", "payload"} | None}.
"""

import asyncio

from app.core import vault
from app.core.database import fetch, fetchrow
from app.core.embeddings import embed_one
from app.core.serde import to_jsonable
from app.modules.execution import analysis, attachments, budgets, contacts, debts, exports, items, transactions, wallets
from app.modules.execution.resolvers import (
    resolve_category_id,
    resolve_or_create_category_id,
    resolve_wallet_id,
    workspace_currency,
)

# Canvas rules — mirror ARTIFACT_MAP / onArtifact (the orchestrator). payload is the
# builder's `data`; emit the canvas only when the threshold holds.
_ARTIFACTS = {
    "getSpendingAnalysis": ("spending-canvas", lambda p: _num(p, "totalSpending") > 0),
    "getRevenueSummary": ("revenue-canvas", lambda p: _num(p, "totalRevenue") > 0),
    "getBurnRate": ("burn-rate-canvas", lambda p: _num(p, "avgMonthlyBurn") > 0),
    "getDebtAnalysis": ("debt-canvas", lambda p: _num(p, "count") > 0),
    "getBudgetStatus": ("budget-canvas", lambda p: bool(p.get("budgets"))),
}


def _num(payload: dict, key: str) -> float:
    try:
        return float((payload.get("metrics") or {}).get(key) or 0)
    except (TypeError, ValueError):
        return 0.0


_ATTACHMENT_TOOLS = {"export_transactions", "get_receipt_attachment"}


def _artifact_for(tool: str, result: dict):
    if tool in _ATTACHMENT_TOOLS:
        return _attachment_artifact(result)

    spec = _ARTIFACTS.get(tool)
    if not spec or not isinstance(result, dict):
        return None
    payload = result.get("data")
    if not isinstance(payload, dict):
        return None
    canvas_type, ok = spec
    return {"type": canvas_type, "payload": payload} if ok(payload) else None


def _attachment_artifact(result: dict):
    """Unlike _ARTIFACTS' threshold-gated analysis canvases, a file
    attachment always renders when its tool succeeded — there's no "empty"
    case worth hiding."""
    if not isinstance(result, dict) or not result.get("success"):
        return None
    payload = result.get("data")
    if not isinstance(payload, dict) or not payload.get("url"):
        return None
    return {
        "type": "file-attachment",
        "payload": {"url": payload["url"], "name": payload.get("name"), "mimeType": payload.get("mime_type")},
    }


async def _none():
    """Placeholder awaitable for an optional slot in an asyncio.gather() call."""
    return None


async def execute_tool(tool: str, inp: dict, workspace_id: str, user_id: str) -> dict:
    inp = inp or {}
    result = await _dispatch(tool, inp, workspace_id, user_id)
    return {"result": result, "artifact": _artifact_for(tool, result)}


async def _dispatch(tool: str, inp: dict, workspace_id: str, user_id: str) -> dict:
    # ── Writes ────────────────────────────────────────────────────────────────
    if tool == "create_transaction":
        # Independent lookups — resolved concurrently instead of one after another.
        wallet_id, to_wallet_id, category_id = await asyncio.gather(
            resolve_wallet_id(workspace_id, inp.get("walletId")),
            resolve_wallet_id(workspace_id, inp["toWalletId"]) if inp.get("toWalletId") else _none(),
            resolve_or_create_category_id(workspace_id, user_id, inp.get("categoryId"), inp.get("type")),
        )
        body = {
            "type": inp.get("type"),
            "amount": inp.get("amount"),
            "date": inp.get("date"),
            "name": inp.get("name"),
            "description": inp.get("description"),
            "wallet_id": wallet_id,
            "to_wallet_id": to_wallet_id,
            "category_id": category_id,
        }
        return await transactions.create_transaction(workspace_id, user_id, body)

    if tool == "update_transaction":
        body = dict(inp)
        if inp.get("categoryId") is not None:
            body["categoryId"] = await resolve_category_id(workspace_id, inp["categoryId"])
        return await transactions.update_transaction(workspace_id, user_id, inp["id"], body)

    if tool == "delete_transaction":
        return await transactions.delete_transaction(workspace_id, user_id, inp["id"])

    if tool == "create_debt":
        return await debts.create_debt(workspace_id, user_id, inp)

    if tool == "pay_debt":
        wallet_id = await resolve_wallet_id(workspace_id, inp.get("walletId")) if inp.get("walletId") else None
        return await debts.pay_debt(workspace_id, user_id, inp["debtId"], inp["amount"], wallet_id)

    if tool == "update_debt":
        return await debts.update_debt(workspace_id, user_id, inp["debtId"], inp)

    if tool == "delete_debt":
        return await debts.delete_debt(workspace_id, user_id, inp["debtId"])

    if tool == "search_contacts":
        return await contacts.search_contacts(workspace_id, inp["query"])

    if tool == "create_contact":
        return await contacts.create_contact(
            workspace_id, user_id, inp["name"], inp.get("email"), inp.get("phone"), inp.get("note")
        )

    if tool == "update_contact":
        return await contacts.update_contact(workspace_id, user_id, inp["contactId"], inp)

    if tool == "delete_contact":
        return await contacts.delete_contact(workspace_id, user_id, inp["contactId"])

    if tool == "create_wallet":
        return await wallets.create_wallet(
            workspace_id, user_id, inp["name"], inp.get("balance", 0),
            inp.get("isIncludedInTotals", True), inp.get("groupId"),
        )

    if tool == "update_wallet":
        fields = {
            "name": inp.get("name"), "balance": inp.get("balance"),
            "is_included_in_totals": inp.get("isIncludedInTotals"), "group_id": inp.get("groupId"),
        }
        return await wallets.update_wallet(workspace_id, user_id, inp["walletId"], fields)

    if tool == "delete_wallet":
        return await wallets.delete_wallet(workspace_id, user_id, inp["walletId"])

    if tool == "create_wallet_group":
        return await wallets.create_wallet_group(workspace_id, user_id, inp["name"])

    if tool == "update_wallet_group":
        return await wallets.update_wallet_group(workspace_id, user_id, inp["groupId"], inp["name"])

    if tool == "delete_wallet_group":
        return await wallets.delete_wallet_group(workspace_id, user_id, inp["groupId"])

    if tool == "create_budget":
        return await budgets.create_budget(workspace_id, user_id, inp["categoryId"], inp["amount"])

    if tool == "update_budget":
        return await budgets.update_budget(workspace_id, user_id, inp["budgetId"], inp["amount"])

    if tool == "delete_budget":
        return await budgets.delete_budget(workspace_id, user_id, inp["budgetId"])

    if tool == "rename_document":
        return await vault.rename_file(workspace_id, user_id, inp["vaultFileId"], inp["newName"])

    if tool == "delete_document":
        return await vault.delete_file(workspace_id, user_id, inp["vaultFileId"])

    if tool == "split_bill":
        wallet_id, category_id = await asyncio.gather(
            resolve_wallet_id(workspace_id, inp.get("walletId")),
            resolve_category_id(workspace_id, inp.get("categoryId")),
        )
        body = {**inp, "wallet_id": wallet_id, "category_id": category_id}
        return await debts.split_bill(workspace_id, user_id, body)

    if tool == "set_default_wallet":
        target = await resolve_wallet_id(workspace_id, inp.get("walletId"))
        if not target:
            return {"success": False, "error": "Could not find a matching wallet to set as default."}
        return await wallets.set_default_wallet(workspace_id, user_id, target)

    if tool == "add_transaction_items":
        return await items.add_transaction_items(
            workspace_id, user_id, inp.get("transactionId"), inp.get("items") or []
        )

    # ── Analysis (canvas) ─────────────────────────────────────────────────────
    if tool == "getSpendingAnalysis":
        return {"success": True, "data": await analysis.spending(workspace_id, inp)}
    if tool == "getRevenueSummary":
        return {"success": True, "data": await analysis.revenue(workspace_id, inp)}
    if tool == "getBurnRate":
        return {"success": True, "data": await analysis.burn_rate(workspace_id, inp)}
    if tool == "getDebtAnalysis":
        return {"success": True, "data": await analysis.debt(workspace_id, inp)}
    if tool == "getBudgetStatus":
        return {"success": True, "data": await analysis.budget(workspace_id, inp)}

    # ── File attachments ─────────────────────────────────────────────────────
    if tool == "export_transactions":
        return await exports.export_transactions_csv(workspace_id, inp)
    if tool == "get_receipt_attachment":
        return await attachments.get_receipt_attachment(workspace_id, inp["transactionId"])

    # ── Reads ─────────────────────────────────────────────────────────────────
    if tool == "list_documents":
        return await vault.list_files(workspace_id, inp.get("query"))
    if tool == "search_transaction_items":
        return await items.search_transaction_items(workspace_id, inp["query"], inp.get("limit", 10))
    if tool == "recall_transaction":
        return await items.recall_transaction(workspace_id, inp["query"], inp.get("limit", 5))
    if tool == "get_workspace_context":
        return await _workspace_context(workspace_id)
    if tool == "get_recent_transactions":
        return await _recent_transactions(workspace_id, inp)
    if tool == "get_outstanding_debts":
        return await _outstanding_debts(workspace_id)
    if tool == "search_documents":
        return await _search_documents(workspace_id, inp["query"], inp.get("limit", 5))

    # ── UI-only (no DB, no audit) ────────────────────────────────────────────
    if tool == "present_choices":
        # Passthrough — the frontend renders these as clickable buttons from the
        # tool_call event args directly; the model just needs a result to continue.
        return {"success": True, "acknowledged": True}

    return {"success": False, "error": f"Unknown tool: {tool}"}


# ── Read-tool helpers ─────────────────────────────────────────────────────────


async def fetch_wallets_and_categories(workspace_id: str) -> dict:
    """Shared by the get_workspace_context tool (fallback for mid-conversation
    edge cases) and chat_money_path.py's per-turn system-prompt injection
    (the common case — avoids the model spending a tool-call round trip on
    nearly every turn just to learn its own wallet/category IDs)."""
    wallets_rows = await fetch(
        "SELECT id, name, balance, is_default FROM wallets "
        "WHERE workspace_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC",
        workspace_id,
    )
    cat_rows = await fetch(
        "SELECT id, name, type FROM categories WHERE workspace_id = $1 AND deleted_at IS NULL",
        workspace_id,
    )
    return {
        "wallets": [to_jsonable(dict(r)) for r in wallets_rows],
        "categories": [dict(r) for r in cat_rows],
    }


async def _workspace_context(workspace_id: str) -> dict:
    currency = await workspace_currency(workspace_id)
    wc = await fetch_wallets_and_categories(workspace_id)
    return {
        "success": True,
        "data": {
            "currency": currency,
            "wallets": wc["wallets"],
            "categories": wc["categories"],
        },
    }


async def _recent_transactions(workspace_id: str, inp: dict) -> dict:
    limit = int(inp.get("limit") or 10)
    conds = ["t.workspace_id = $1", "t.deleted_at IS NULL"]
    args: list = [workspace_id]
    if inp.get("from"):
        args.append(inp["from"])
        conds.append(f"t.date >= ${len(args)}::text::timestamp")
    if inp.get("to"):
        args.append(inp["to"])
        conds.append(f"t.date <= ${len(args)}::text::timestamp")
    args.append(limit)
    rows = await fetch(
        f"""
        SELECT t.id, t.amount, t.type, t.date, t.name,
               c.name AS category_name, w.name AS wallet_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN wallets w ON t.wallet_id = w.id
        WHERE {' AND '.join(conds)}
        ORDER BY t.date DESC LIMIT ${len(args)}
        """,
        *args,
    )
    return {"success": True, "data": [to_jsonable(dict(r)) for r in rows]}


async def _outstanding_debts(workspace_id: str) -> dict:
    rows = await fetch(
        """
        SELECT d.id, d.type, d.amount, d.remaining_amount, d.status, d.due_date,
               ct.name AS contact_name
        FROM debts d
        LEFT JOIN contacts ct ON d.contact_id = ct.id
        WHERE d.workspace_id = $1 AND d.deleted_at IS NULL AND d.remaining_amount > 0
        ORDER BY d.remaining_amount DESC
        """,
        workspace_id,
    )
    return {"success": True, "data": [to_jsonable(dict(r)) for r in rows]}


async def _search_documents(workspace_id: str, query: str, limit: int) -> dict:
    """Cosine search over the workspace's vault file chunks (RagRepository port)."""
    # embed_one is a blocking OpenAI call; keep it off the event loop.
    vec = await asyncio.to_thread(embed_one, query)
    rows = await fetch(
        """
        SELECT vfc.content, vf.name AS file_name,
               1 - (vfc.embedding <=> $2) AS similarity
        FROM vault_file_chunks vfc
        JOIN vault_files vf ON vfc.vault_file_id = vf.id
        WHERE vfc.workspace_id = $1 AND vfc.embedding IS NOT NULL
        ORDER BY vfc.embedding <=> $2
        LIMIT $3
        """,
        workspace_id,
        vec,
        limit,
    )
    results = [
        {"content": r["content"], "file_name": r["file_name"],
         "similarity": float(r["similarity"])}
        for r in rows
        if float(r["similarity"]) >= 0.3
    ]
    return {"success": True, "data": results}
