"""The fifteen tool definitions the model sees (D17, D88, D103).

**The specification for this module is `apps/api/crates/domain/src/tools.rs`.**
That file is the validator: it parses every tool call the model produces, and
it refuses an argument this catalog did not declare, an amount that arrived
as a JSON number, and a date that is not ISO 8601. What the model is shown
here and what the API accepts there must describe the same contract. A
mismatch between the two is the bug this module exists to prevent, so a
change to the Rust reader is a change to this file in the same commit.

Shapes are the Anthropic Messages API's: `name`, `description`,
`input_schema`. Nothing here executes anything. The loop that calls these
tools is US-030, and when it exists it will still hold no database
connection and no user token: every call goes back to the API (D3, D4).

Two rules are worth stating where the schemas are, because they are the two
the model gets wrong:

- **Every money value is a string** (D12). `amount`, `to_amount`,
  `min_amount`, `max_amount`, and a line item's `amount` and `quantity`. The
  API refuses a JSON number in an amount position rather than converting it,
  because by then it has already been through a double.
- **Every figure a read tool returns is already computed, rounded and
  formatted** (D27). The model quotes it. It never adds two of them together.

`additionalProperties` is `false` everywhere. The API treats an undeclared
key as an error rather than ignoring it, so a schema that invited one would
turn a misunderstood call into a refused call for no reason.
"""

from __future__ import annotations

from typing import Any

#: The most line items one call may add, and the most options a question may
#: offer. Both mirror `MAX_ITEMS` and `MAX_CHOICES` in the Rust validator.
MAX_ITEMS = 50
MAX_CHOICES = 10

#: Bounds on a free-text argument and on an id, mirroring `MAX_TEXT` and
#: `MAX_ID`.
MAX_TEXT = 500
MAX_ID = 64

#: The fields the API reads with its decimal parser. Nothing in this service
#: parses one; the list is here so a test can assert none of them is ever
#: typed as a number.
MONEY_FIELDS = frozenset(
    {"amount", "to_amount", "min_amount", "max_amount", "quantity"}
)

_MONEY_NOTE = "A decimal amount as a string, never a JSON number."
_DATE_NOTE = "ISO 8601: 2026-11-03, or a full timestamp. Never a locale format."

TRANSACTION_TYPES = ["income", "expense", "transfer"]
CATEGORY_TYPES = ["income", "expense"]
SUMMARY_GROUPINGS = ["category", "wallet", "type", "month"]


def _money(what: str) -> dict[str, Any]:
    return {"type": "string", "description": f"{what} {_MONEY_NOTE}"}


def _date(what: str) -> dict[str, Any]:
    return {"type": "string", "description": f"{what} {_DATE_NOTE}"}


def _id(what: str) -> dict[str, Any]:
    return {"type": "string", "minLength": 1, "maxLength": MAX_ID, "description": what}


def _text(what: str) -> dict[str, Any]:
    return {"type": "string", "minLength": 1, "maxLength": MAX_TEXT, "description": what}


def _limit() -> dict[str, Any]:
    return {
        "type": "integer",
        "minimum": 1,
        "maximum": 50,
        "description": "How many rows to return, 1 to 50. Defaults to a sensible page.",
    }


def _schema(
    properties: dict[str, Any],
    required: list[str] | None = None,
) -> dict[str, Any]:
    """One argument object. Closed, always: an undeclared key is refused."""
    return {
        "type": "object",
        "properties": properties,
        "required": required or [],
        "additionalProperties": False,
    }


def _transaction_fields() -> dict[str, Any]:
    """The field set `create_transaction` and `update_transaction` share.

    One builder, because the API reads both with one function. What differs
    between the two tools is which fields are required, not which exist.
    """
    return {
        "type": {
            "type": "string",
            "enum": list(TRANSACTION_TYPES),
            "description": "income, expense or transfer.",
        },
        "amount": _money("The amount leaving or entering the wallet."),
        "to_amount": _money(
            "For a transfer, the amount arriving in to_wallet_id. Required on a "
            "transfer, because the two wallets may hold different currencies."
        ),
        "wallet_id": _id("The wallet this transaction belongs to. Use an id from the prompt."),
        "to_wallet_id": _id("For a transfer, the wallet receiving the money."),
        "category_id": _id("The category. Omit it rather than guessing one."),
        "date": _date("When it happened. Defaults to today."),
        "name": _text("What it was, as the user said it. Keep their words."),
        "description": _text("A longer note, when the user gave one."),
    }


GET_WORKSPACE_CONTEXT = {
    "name": "get_workspace_context",
    "description": (
        "Re-read the workspace's wallets and categories with their ids and balances. "
        "Rarely needed: the prompt already carries them. Use it after creating a "
        "wallet or a category in this turn, so you have the new id."
    ),
    "input_schema": _schema({}),
}

GET_RECENT_TRANSACTIONS = {
    "name": "get_recent_transactions",
    "description": (
        "Recent transactions, newest first. Amounts come back formatted. Quote them; "
        "do not add them up. Use get_spending_summary for any total."
    ),
    "input_schema": _schema(
        {
            "limit": _limit(),
            "from": _date("Only transactions on or after this date."),
            "to": _date("Only transactions on or before this date."),
        }
    ),
}

SEARCH_TRANSACTIONS = {
    "name": "search_transactions",
    "description": (
        "Find transactions by text, type, category, wallet, amount range or date "
        "range. Every filter is optional and they combine. Amounts come back "
        "formatted; quote them rather than recomputing anything."
    ),
    "input_schema": _schema(
        {
            "query": _text("Text to match in the name or the description."),
            "type": {
                "type": "string",
                "enum": list(TRANSACTION_TYPES),
                "description": "Restrict to income, expense or transfer.",
            },
            "category_id": _id("Restrict to one category."),
            "wallet_id": _id("Restrict to one wallet."),
            "min_amount": _money("The smallest amount to match."),
            "max_amount": _money("The largest amount to match."),
            "from": _date("Only transactions on or after this date."),
            "to": _date("Only transactions on or before this date."),
            "limit": _limit(),
        }
    ),
}

GET_SPENDING_SUMMARY = {
    "name": "get_spending_summary",
    "description": (
        "Totals over a date range, grouped. The result carries every figure already "
        "computed, rounded and formatted, plus the comparison with the previous "
        "period and a direction label. State those values as given. Do no arithmetic "
        "of your own: not a total, not a difference, not a percentage."
    ),
    "input_schema": _schema(
        {
            "from": _date("The start of the range, inclusive."),
            "to": _date("The end of the range, inclusive. Must not be before from."),
            "group_by": {
                "type": "string",
                "enum": list(SUMMARY_GROUPINGS),
                "description": "How to group the totals. Defaults to category.",
            },
        },
        required=["from", "to"],
    ),
}

CREATE_TRANSACTION = {
    "name": "create_transaction",
    "description": (
        "Record one transaction. Needs type, amount and wallet_id; a transfer also "
        "needs to_wallet_id and to_amount. Ask with present_choices rather than "
        "guessing a wallet or a category. One call records one transaction: never "
        "fold several of the user's into one."
    ),
    "input_schema": _schema(
        _transaction_fields(),
        required=["type", "amount", "wallet_id"],
    ),
}

UPDATE_TRANSACTION = {
    "name": "update_transaction",
    "description": (
        "Change an existing transaction. Needs transaction_id; send only the fields "
        "that change. A field you omit is left as it is, so do not resend values you "
        "did not mean to touch."
    ),
    "input_schema": _schema(
        {
            "transaction_id": _id("The transaction to change."),
            **_transaction_fields(),
        },
        required=["transaction_id"],
    ),
}

DELETE_TRANSACTION = {
    "name": "delete_transaction",
    "description": (
        "Delete one transaction. The first call is answered with the row's details "
        "and a request to confirm; show those to the user and ask. Only after they "
        "agree, in a later turn, call again with confirmed set to true. Setting it "
        "on the first call does nothing: the API honours it only for an id it has "
        "already challenged."
    ),
    "input_schema": _schema(
        {
            "transaction_id": _id("The transaction to delete."),
            "confirmed": {
                "type": "boolean",
                "description": (
                    "True only on a second call, after the user agreed in their own turn."
                ),
            },
        },
        required=["transaction_id"],
    ),
}

ADD_TRANSACTION_ITEMS = {
    "name": "add_transaction_items",
    "description": (
        f"Add line items to an existing transaction. At most {MAX_ITEMS} in one call. "
        "Each item's amount and quantity are strings. The API does not check that the "
        "items sum to the transaction, and neither do you: send what the user or the "
        "reviewed receipt gave."
    ),
    "input_schema": _schema(
        {
            "transaction_id": _id("The transaction the items belong to."),
            "items": {
                "type": "array",
                "minItems": 1,
                "maxItems": MAX_ITEMS,
                "description": "The line items to add.",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": _text("What the line is."),
                        "amount": _money("The line total."),
                        "quantity": _money("How many, when the line says so."),
                    },
                    "required": ["name", "amount"],
                    "additionalProperties": False,
                },
            },
        },
        required=["transaction_id", "items"],
    ),
}

CREATE_WALLET = {
    "name": "create_wallet",
    "description": (
        "Create a wallet. A new wallet starts empty: there is no opening balance to "
        "set, so record the money with create_transaction afterwards. Call "
        "get_workspace_context to pick up the new id."
    ),
    "input_schema": _schema(
        {
            "name": _text("What to call it, in the user's words."),
            "group_id": _id("The wallet group to file it under, when the user named one."),
            "currency_code": _text(
                "An ISO 4217 code, when the wallet holds a currency other than the "
                "workspace's. Omit it to use the workspace currency."
            ),
        },
        required=["name"],
    ),
}

CREATE_CATEGORY = {
    "name": "create_category",
    "description": (
        "Create a category. Check the categories in the prompt first: an almost "
        "duplicate is worse than reusing the one that exists."
    ),
    "input_schema": _schema(
        {
            "name": _text("What to call it, in the user's words."),
            "type": {
                "type": "string",
                "enum": list(CATEGORY_TYPES),
                "description": "income or expense.",
            },
        },
        required=["name", "type"],
    ),
}

PRESENT_CHOICES = {
    "name": "present_choices",
    "description": (
        "Ask the user to pick, instead of guessing a wallet, a category or a date. "
        f"Between 2 and {MAX_CHOICES} choices. This asks a question and changes "
        "nothing, so prefer it whenever the right value is not certain."
    ),
    "input_schema": _schema(
        {
            "question": _text("The question, in the user's language."),
            "choices": {
                "type": "array",
                "minItems": 2,
                "maxItems": MAX_CHOICES,
                "description": "The options, as short labels.",
                "items": {"type": "string", "minLength": 1, "maxLength": MAX_TEXT},
            },
        },
        required=["question", "choices"],
    ),
}

def _range() -> dict[str, Any]:
    return _schema(
        {
            "from": _date("The start of the range, inclusive."),
            "to": _date("The end of the range, inclusive. Must not be before from."),
        },
        required=["from", "to"],
    )


#: The three analysis tools (D88). Each answers with figures already computed
#: and formatted, and the web app opens a panel beside the reply that draws
#: the same figures as charts and tables. The prompt tells the model to keep
#: its own reply short when that happens.
GET_SPENDING_ANALYSIS = {
    "name": "get_spending_analysis",
    "description": (
        "Spending over a date range: the total with the comparison to the previous "
        "period, the breakdown by category with each share, and the largest "
        "expenses. Use it when the user asks where the money went or for a "
        "spending analysis. Every figure is computed and formatted; quote them."
    ),
    "input_schema": _range(),
}

GET_INCOME_SUMMARY = {
    "name": "get_income_summary",
    "description": (
        "Income over a date range: the total with the comparison to the previous "
        "period, the monthly average, the monthly series, the breakdown by "
        "category and the latest income. Every figure is computed and formatted; "
        "quote them."
    ),
    "input_schema": _range(),
}

GET_BURN_RATE = {
    "name": "get_burn_rate",
    "description": (
        "Monthly spending over a date range: the amount spent each month, the "
        "average per month, and how many months ran above it. Use it for burn "
        "rate or average monthly spending questions. Every figure is computed "
        "and formatted; quote them."
    ),
    "input_schema": _range(),
}

#: Budget against spending for one month (D103). Opens the same panel as the
#: three analysis tools, drawing each budget's bar.
GET_BUDGET_STATUS = {
    "name": "get_budget_status",
    "description": (
        "Monthly budgets against what was spent: each budgeted expense category "
        "with its limit, the amount spent, what remains and the percentage used, "
        "plus the totals and which categories are over. Use it when the user asks "
        "about their budget. Omit month for the current month. Every figure is "
        "computed and formatted; quote them."
    ),
    "input_schema": _schema(
        {
            "month": {
                "type": "string",
                "pattern": "^[0-9]{4}-[0-9]{2}$",
                "description": "The calendar month as YYYY-MM. Omit for the current month.",
            },
        }
    ),
}

#: The catalog, in the order `Tool::ALL` lists it in the Rust validator.
TOOL_DEFINITIONS: list[dict[str, Any]] = [
    GET_WORKSPACE_CONTEXT,
    GET_RECENT_TRANSACTIONS,
    SEARCH_TRANSACTIONS,
    GET_SPENDING_SUMMARY,
    GET_SPENDING_ANALYSIS,
    GET_INCOME_SUMMARY,
    GET_BURN_RATE,
    GET_BUDGET_STATUS,
    CREATE_TRANSACTION,
    UPDATE_TRANSACTION,
    DELETE_TRANSACTION,
    ADD_TRANSACTION_ITEMS,
    CREATE_WALLET,
    CREATE_CATEGORY,
    PRESENT_CHOICES,
]

TOOLS_BY_NAME: dict[str, dict[str, Any]] = {
    definition["name"]: definition for definition in TOOL_DEFINITIONS
}

TOOL_NAMES: tuple[str, ...] = tuple(TOOLS_BY_NAME)


def tool_definition(name: str) -> dict[str, Any] | None:
    """One definition by name, or `None` for a name that is not a tool."""
    return TOOLS_BY_NAME.get(name)


__all__ = [
    "MAX_CHOICES",
    "MAX_ITEMS",
    "MONEY_FIELDS",
    "TOOL_DEFINITIONS",
    "TOOL_NAMES",
    "TOOLS_BY_NAME",
    "tool_definition",
]
