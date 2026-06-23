from app.core import llm
from app.core.currency import format_currency, get_currency_settings
from app.core.database import fetch
from app.modules.analyzer.categories import ALL_CATEGORIES  # fallback for new workspaces
from app.utils.helpers import extract_json

_INTENTS = ["expense", "income", "transfer", "query", "other"]
_SENTIMENTS = ["positive", "neutral", "negative"]


async def _workspace_categories(workspace_id: str) -> list[str]:
    rows = await fetch(
        """
        SELECT name FROM categories
        WHERE workspace_id = $1 AND deleted_at IS NULL
        ORDER BY type, sort_order
        """,
        workspace_id,
    )
    names = [r["name"] for r in rows]
    return names or list(ALL_CATEGORIES)


def _build_user_prompt(items, categories: list[str], currency: dict | None) -> str:
    cats = ", ".join(categories)
    listing = "\n".join(
        f'{i}. "{it.description}"'
        + (f" ({format_currency(it.amount, currency)})" if it.amount is not None else "")
        for i, it in enumerate(items)
    )
    return (
        "Classify each transaction below.\n\n"
        f"Allowed categories (pick EXACTLY one, including the emoji): {cats}\n"
        f"intent: one of {_INTENTS}\n"
        f"sentiment: one of {_SENTIMENTS}\n\n"
        f"Transactions:\n{listing}\n\n"
        "Reply with ONLY a JSON array. Each element: "
        '{"index": <int>, "category": "<category>", "merchant": "<merchant name or null>", '
        '"intent": "<intent>", "sentiment": "<sentiment>"}'
    )


def classify_results(items, parsed, valid: set[str]) -> list[dict]:
    """Pure: map raw LLM output onto items, validating against allowed categories."""
    by_index = {p.get("index"): p for p in parsed if isinstance(p, dict)}
    fallback = "Other" if "Other" in valid else (next(iter(valid), "Other"))

    results = []
    for i, it in enumerate(items):
        p = by_index.get(i, {})
        category = p.get("category")
        if category not in valid:
            category = fallback
        intent = p.get("intent")
        sentiment = p.get("sentiment")
        merchant = p.get("merchant")
        results.append(
            {
                "description": it.description,
                "category": category,
                "merchant": merchant or None,
                "intent": intent if intent in _INTENTS else "other",
                "sentiment": sentiment if sentiment in _SENTIMENTS else "neutral",
            }
        )
    return results


async def analyze(items, workspace_id: str) -> list[dict]:
    categories = await _workspace_categories(workspace_id)
    currency = await get_currency_settings(workspace_id)

    system = (
        "You are a precise financial transaction classifier for an Indonesian "
        "finance app. Respond with ONLY a JSON array, no prose."
    )
    raw = llm.complete(
        system,
        [{"role": "user", "content": _build_user_prompt(items, categories, currency)}],
        max_tokens=2048,
    )
    parsed = extract_json(raw) or []
    return classify_results(items, parsed, set(categories))
