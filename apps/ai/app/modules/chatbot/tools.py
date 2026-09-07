"""OpenAI function-calling tool specs for website chat, and chat_begin/chat_end
— the pre/post-LLM money path (session, receipt-draft short-circuit, quota,
system prompt; reply persistence + atomic token increment). Both run fully
in-process against Postgres now (chat_money_path.py); DB writes, audit, and the
canvas artifact rules for tool execution live in execution/executor.py.

ponytail: webSearch tool is omitted in Phase 2 (its fetch logic lives only in the
TS orchestrator); add it when web-search parity is needed.
"""

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
    _fn(
        "present_choices",
        "Render a small set of clickable follow-up buttons under your reply, IN "
        "ADDITION to asking the question in your normal text — this never replaces "
        "your text reply, it just gives the user a one-tap shortcut. Use it when you "
        "just asked the user to pick from a short, known list (e.g. which account to "
        "use, which of a few matching transactions to edit/delete). Each option's "
        "`message` is the exact follow-up message to send on the user's behalf when "
        "they click it — write it as if the user typed it themselves, in their "
        "language. Do not use this for open-ended questions with no fixed set of "
        "answers (e.g. asking for an amount).",
        {
            "question": {
                "type": "string",
                "description": "Short label for this choice group (not shown verbatim — for your own bookkeeping).",
            },
            "options": {
                "type": "array",
                "maxItems": 4,
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {
                            "type": "string",
                            "description": "Short button text, e.g. 'Pakai Cash & jadikan default'.",
                        },
                        "message": {
                            "type": "string",
                            "description": "Full follow-up message to send when clicked, e.g. 'Pakai Cash dan jadikan akun default'.",
                        },
                    },
                    "required": ["label", "message"],
                },
            },
        },
        ["question", "options"],
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
    """Carries an HTTP status + body for the chatbot routes to forward to the
    browser verbatim (chat_begin/chat_end raise this for auth/quota/session
    errors — see chatbot.py's post_chat_web / post_chat_web_stream)."""

    def __init__(self, status_code: int, body: dict):
        self.status_code = status_code
        self.body = body
        super().__init__(f"api error {status_code}")


async def chat_begin(
    token: str, messages: list[dict], session_id: str | None, web_search: bool
) -> dict:
    """Pre-LLM money path: verifies the oewang-session JWT itself and runs
    chat_begin_core (session mgmt, receipt-draft short-circuit, quota check,
    system prompt) directly against Postgres. Raises ApiError on auth/quota/
    session-not-found so the route can forward it."""
    from app.core.auth import get_auth
    from app.core.quota import PlanLimitReached
    from app.modules.chatbot.chat_money_path import SessionNotFoundError, chat_begin_core

    auth = await get_auth(token)
    if auth is None:
        raise ApiError(401, {"error": "Unauthorized"})

    try:
        result = await chat_begin_core(auth["workspace_id"], auth["user_id"], messages, session_id)
    except PlanLimitReached as e:
        raise ApiError(422, {"error": "PLAN_LIMIT_REACHED", "meta": {"reset_at": e.reset_at}}) from e
    except SessionNotFoundError as e:
        raise ApiError(500, {"message": str(e)}) from e

    if result["kind"] == "early":
        return {"kind": "early", "session_id": result["sessionId"], "reply": result["reply"]}
    return {
        "kind": "ready",
        "workspace_id": auth["workspace_id"],
        "user_id": auth["user_id"],
        "session_id": result["sessionId"],
        "system_prompt": result["systemPrompt"],
        "history": result["history"],
        "current_tokens": result["currentTokens"],
    }


async def chat_end(
    workspace_id: str, session_id: str, result: dict, current_tokens: int
) -> None:
    """Post-LLM money path: persist the reply and atomically increment token
    usage against Postgres directly."""
    from app.modules.chatbot.chat_money_path import chat_end_core

    await chat_end_core(
        workspace_id,
        session_id,
        result["reply"],
        usage=result.get("usage"),
        artifacts=result.get("artifacts"),
        provider={"name": "openai", "response_id": result.get("response_id")},
    )
