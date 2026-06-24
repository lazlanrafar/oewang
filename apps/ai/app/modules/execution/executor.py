"""execute_tool — the AI money path's single entry point. Dispatches a tool call to
the right read/write handler and attaches a canvas artifact when the analysis tools
cross their threshold. Replaces the Elysia /ai/internal/execute-tool callback: the
DB writes, audit, and artifact rules now live here in Python.

Returns {"result": <tool result>, "artifact": {"type", "payload"} | None}.
"""

from app.core.database import fetch, fetchrow
from app.core.embeddings import embed_one
from app.core.serde import to_jsonable
from app.modules.execution import analysis, debts, items, transactions, wallets
from app.modules.execution.resolvers import (
    resolve_category_id,
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


def _artifact_for(tool: str, result: dict):
    spec = _ARTIFACTS.get(tool)
    if not spec or not isinstance(result, dict):
        return None
    payload = result.get("data")
    if not isinstance(payload, dict):
        return None
    canvas_type, ok = spec
    return {"type": canvas_type, "payload": payload} if ok(payload) else None


async def execute_tool(tool: str, inp: dict, workspace_id: str, user_id: str) -> dict:
    inp = inp or {}
    result = await _dispatch(tool, inp, workspace_id, user_id)
    return {"result": result, "artifact": _artifact_for(tool, result)}


async def _dispatch(tool: str, inp: dict, workspace_id: str, user_id: str) -> dict:
    # ── Writes ────────────────────────────────────────────────────────────────
    if tool == "create_transaction":
        body = {
            "type": inp.get("type"),
            "amount": inp.get("amount"),
            "date": inp.get("date"),
            "name": inp.get("name"),
            "description": inp.get("description"),
            "wallet_id": await resolve_wallet_id(workspace_id, inp.get("walletId")),
            "to_wallet_id": await resolve_wallet_id(workspace_id, inp.get("toWalletId")) if inp.get("toWalletId") else None,
            "category_id": await resolve_category_id(workspace_id, inp.get("categoryId")),
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

    if tool == "split_bill":
        body = {
            **inp,
            "wallet_id": await resolve_wallet_id(workspace_id, inp.get("walletId")),
            "category_id": await resolve_category_id(workspace_id, inp.get("categoryId")),
        }
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

    # ── Reads ─────────────────────────────────────────────────────────────────
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

    return {"success": False, "error": f"Unknown tool: {tool}"}


# ── Read-tool helpers ─────────────────────────────────────────────────────────


async def _workspace_context(workspace_id: str) -> dict:
    currency = await workspace_currency(workspace_id)
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
        "success": True,
        "data": {
            "currency": currency,
            "wallets": [to_jsonable(dict(r)) for r in wallets_rows],
            "categories": [dict(r) for r in cat_rows],
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
    vec = embed_one(query)
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
