"""OpenAI function-calling tool specs for website chat + the call-back client.

The specs mirror the live website orchestrator (`packages/ai/core/ai.orchestrator.ts`
`buildTools`). Execution is NOT done here — every tool call is forwarded to the
Elysia internal endpoint so DB writes, audit logs, analytics and the canvas
artifact rules stay in one place (the TS money path).

ponytail: webSearch tool is omitted in Phase 2 (its fetch logic lives only in the
TS orchestrator); add it when web-search parity is needed.
"""

import httpx

from app.config import get_settings

_PERIOD_SPENDING = [
    "this-month",
    "last-month",
    "last-3-months",
    "this-year",
    "year-to-date",
    "last-year",
    "last-12-months",
]
_PERIOD_REVENUE = [
    "3-months",
    "6-months",
    "this-year",
    "1-year",
    "last-12-months",
    "year-to-date",
    "last-year",
]
_PERIOD_BURN = [
    "3-months",
    "6-months",
    "1-year",
    "last-6-months",
    "last-12-months",
    "year-to-date",
]


def _fn(name: str, description: str, properties: dict, required: list[str]):
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        },
    }


def _analysis(name: str, description: str, periods: list[str]):
    return _fn(
        name,
        description,
        {
            "period": {"type": "string", "enum": periods},
            "from": {"type": "string", "description": "ISO date-time start."},
            "to": {"type": "string", "description": "ISO date-time end."},
            "currency": {"type": "string", "description": "Currency code override."},
            "showCanvas": {"type": "boolean"},
        },
        [],
    )


WEB_TOOLS = [
    _fn(
        "get_workspace_context",
        "Get the user's current workspace context: all wallets with names and "
        "balances, all available categories (with IDs), and currency settings. "
        "Call this FIRST before creating transactions or answering balance questions.",
        {},
        [],
    ),
    _fn(
        "get_recent_transactions",
        "Fetch recent transactions for the workspace. Use when the user asks about "
        "spending history, specific past purchases, or recent activity.",
        {
            "limit": {"type": "integer", "minimum": 1, "maximum": 50},
            "from": {"type": "string", "description": "ISO date start filter."},
            "to": {"type": "string", "description": "ISO date end filter."},
        },
        [],
    ),
    _fn(
        "get_outstanding_debts",
        "Fetch all unpaid debts and receivables for the workspace.",
        {},
        [],
    ),
    _fn(
        "create_transaction",
        "Create a new financial transaction (income, expense, or transfer). Call "
        "get_workspace_context first to get real wallet and category IDs.",
        {
            "type": {"type": "string", "enum": ["income", "expense", "transfer"]},
            "amount": {"type": "number", "description": "Confirmed amount."},
            "date": {"type": "string", "description": "ISO date; defaults to today."},
            "name": {"type": "string", "description": "Name or merchant."},
            "walletId": {"type": "string", "description": "Source wallet ID."},
            "toWalletId": {"type": "string", "description": "Destination wallet ID (transfers only)."},
            "categoryId": {"type": "string", "description": "Category ID."},
            "description": {"type": "string"},
        },
        ["type", "amount", "name", "walletId"],
    ),
    _fn(
        "update_transaction",
        "Update an existing transaction's fields.",
        {
            "id": {"type": "string"},
            "amount": {"type": "number"},
            "name": {"type": "string"},
            "categoryId": {"type": "string"},
            "description": {"type": "string"},
        },
        ["id"],
    ),
    _fn(
        "delete_transaction",
        "Delete (soft-delete) a transaction by ID.",
        {"id": {"type": "string"}},
        ["id"],
    ),
    _fn(
        "create_debt",
        "Record a debt (payable) or receivable. Use 'payable' when the user owes "
        "money, 'receivable' when someone owes the user.",
        {
            "contactName": {"type": "string"},
            "type": {"type": "string", "enum": ["payable", "receivable"]},
            "amount": {"type": "number"},
            "description": {"type": "string"},
            "dueDate": {"type": "string", "description": "Optional ISO due date."},
        },
        ["contactName", "type", "amount"],
    ),
    _fn(
        "set_default_wallet",
        "Set a wallet as the workspace default account. Use when the user asks to "
        "change/switch/set their default account.",
        {"walletId": {"type": "string"}},
        ["walletId"],
    ),
    _fn(
        "split_bill",
        "Create an expense transaction and split it equally with others. "
        "Auto-records receivable debts for each participant.",
        {
            "amount": {"type": "number"},
            "name": {"type": "string"},
            "walletId": {"type": "string"},
            "categoryId": {"type": "string"},
            "contactNames": {"type": "array", "items": {"type": "string"}},
        },
        ["amount", "name", "walletId", "contactNames"],
    ),
    _analysis(
        "getRevenueSummary",
        "Analyze income/revenue — totals, monthly trends, and growth. A chart "
        "renders automatically; just write a text summary.",
        _PERIOD_REVENUE,
    ),
    _analysis(
        "getBurnRate",
        "Calculate monthly burn rate (expense rate) and financial runway. A chart "
        "renders automatically; just write a text summary.",
        _PERIOD_BURN,
    ),
    _analysis(
        "getSpendingAnalysis",
        "Analyze spending patterns and category breakdown. A chart renders "
        "automatically; just write a text summary.",
        _PERIOD_SPENDING,
    ),
    _fn(
        "getDebtAnalysis",
        "Summarize the user's outstanding debts and receivables. A visual canvas "
        "renders automatically; just write a short text summary.",
        {},
        [],
    ),
    _fn(
        "getBudgetStatus",
        "Show budget vs. actual spending per category for a given month. A visual "
        "canvas renders automatically; just write a short text summary.",
        {
            "month": {"type": "integer", "minimum": 1, "maximum": 12},
            "year": {"type": "integer"},
        },
        [],
    ),
    _fn(
        "add_transaction_items",
        "Add purchased line items to an existing transaction after parsing a "
        "receipt. Always call immediately after create_transaction when items exist.",
        {
            "transactionId": {"type": "string"},
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "brand": {"type": "string"},
                        "quantity": {"type": "number"},
                        "unit": {"type": "string"},
                        "unitPrice": {"type": "number"},
                        "amount": {"type": "number"},
                        "categoryId": {"type": "string"},
                    },
                    "required": ["name", "amount"],
                },
            },
        },
        ["transactionId", "items"],
    ),
    _fn(
        "search_transaction_items",
        "Search purchase history by product name or brand. Use for 'when did I "
        "last buy X?' or 'how much do I spend on shampoo?'.",
        {
            "query": {"type": "string"},
            "limit": {"type": "integer"},
        },
        ["query"],
    ),
    _fn(
        "recall_transaction",
        "Recall past transactions matching a short phrase to infer the usual price, "
        "wallet, and category. Use FIRST when the user gives a brief 'buy X' message "
        "WITHOUT an amount. Returns last/average price, frequency, and usual "
        "wallet & category so you can propose a ready-to-confirm transaction.",
        {
            "query": {"type": "string"},
            "limit": {"type": "integer", "minimum": 1, "maximum": 10},
        },
        ["query"],
    ),
    _fn(
        "search_documents",
        "Search the user's uploaded documents (PDFs, spreadsheets, text files) for "
        "information relevant to the query. Returns excerpts from the most relevant "
        "sections.",
        {
            "query": {"type": "string"},
            "limit": {"type": "integer", "minimum": 1, "maximum": 10},
        },
        ["query"],
    ),
]


async def execute_tool(
    name: str, arguments: dict, workspace_id: str, user_id: str
) -> dict:
    """Run one tool locally — DB writes, audit, and canvas all happen in Python now
    (the money path moved here from Elysia). Returns {"result", "artifact"}."""
    from app.modules.execution.executor import execute_tool as run

    return await run(name, arguments, workspace_id, user_id)


class ApiError(Exception):
    """Non-2xx from an Elysia internal endpoint. status_code < 500 carries a
    real answer (quota/auth) the route forwards to the browser verbatim."""

    def __init__(self, status_code: int, body: dict):
        self.status_code = status_code
        self.body = body
        super().__init__(f"api error {status_code}")


def _internal_headers(token: str | None = None) -> dict:
    headers = {"content-type": "application/json"}
    key = get_settings().AI_SERVICE_API_KEY
    if key:
        headers["x-api-key"] = key
    if token:
        headers["authorization"] = f"Bearer {token}"
    return headers


async def chat_begin(
    token: str, messages: list[dict], session_id: str | None, web_search: bool
) -> dict:
    """Pre-LLM money path. Identity is resolved server-side from the JWT in TS;
    raises ApiError on quota/auth/404 so the route can forward it."""
    settings = get_settings()
    payload_messages = [
        {
            "role": m["role"],
            "content": m["content"],
            **({"attachments": m["attachments"]} if m.get("attachments") else {}),
        }
        for m in messages
    ]
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{settings.API_INTERNAL_URL}/v1/ai/internal/chat-begin",
            headers=_internal_headers(token),
            json={
                "messages": payload_messages,
                "session_id": session_id,
                "web_search": web_search,
            },
        )
    if resp.status_code >= 400:
        try:
            body = resp.json()
        except Exception:
            body = {"message": resp.text}
        raise ApiError(resp.status_code, body)
    return resp.json()


async def chat_end(
    workspace_id: str, session_id: str, result: dict, current_tokens: int
) -> None:
    """Post-LLM money path: persist reply + increment tokens (against the count
    read at chat_begin)."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{settings.API_INTERNAL_URL}/v1/ai/internal/chat-end",
            headers=_internal_headers(),
            json={
                "workspace_id": workspace_id,
                "session_id": session_id,
                "reply": result["reply"],
                "usage": result["usage"],
                "artifact": result.get("artifact"),
                "provider": {
                    "name": "openai",
                    "response_id": result.get("response_id"),
                },
                "current_tokens": current_tokens,
            },
        )
        resp.raise_for_status()


async def get_system_prompt(workspace_id: str) -> str:
    """Fetch the website system prompt from Elysia (single source of truth)."""
    settings = get_settings()
    headers = {}
    if settings.AI_SERVICE_API_KEY:
        headers["x-api-key"] = settings.AI_SERVICE_API_KEY
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{settings.API_INTERNAL_URL}/v1/ai/internal/system-prompt",
            headers=headers,
            params={"workspace_id": workspace_id},
        )
        resp.raise_for_status()
        return resp.json().get("system_prompt", "")
