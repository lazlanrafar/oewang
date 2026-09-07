"""Review already-mapped import rows (the CSV/Excel wizard's field+value
mapping already ran) — suggest a category for rows left blank, and flag rows
whose type looks inconsistent with their description. Kept separate from
imports/service.py: that module extracts transactions from raw file bytes,
this one only classifies rows the caller already built.
"""

import logging

from app.core import llm
from app.core.quota import PlanLimitReached
from app.utils.helpers import extract_json

log = logging.getLogger("ai.imports.review")

# Mirrors extract_transactions' 100-row cap convention (imports/service.py) —
# capped to keep the prompt/latency bounded. Rows beyond this get no
# suggestion; the caller reports how many were actually reviewed.
MAX_ROWS = 150

_VALID_TYPES = {"income", "expense", "transfer"}


def _build_prompt(rows: list[dict], category_names: list[str]) -> str:
    cats = ", ".join(category_names)
    listing = "\n".join(
        f"{r['index']}. type={r.get('type')!r} amount={r.get('amount')} "
        f"name={r.get('name') or ''!r} description={r.get('description') or ''!r} "
        f"hasCategory={r.get('hasCategoryId', False)}"
        for r in rows
    )
    return (
        "Review these imported transaction rows for two issues only:\n"
        "1. A row with hasCategory=False: suggest ONE category from the allowed "
        "list, based on its name/description. Skip it if nothing fits well.\n"
        "2. A row whose type looks inconsistent with its description (e.g. "
        "described as a refund/salary/transfer but marked expense, or vice "
        "versa). Only flag this when confident — most rows need no change.\n\n"
        f"Allowed categories (pick EXACTLY one): {cats}\n\n"
        f"Rows:\n{listing}\n\n"
        "Reply with ONLY a JSON array, one element per issue found (omit rows "
        "with no issue). Each element: "
        '{"index": <int>, "field": "category"|"type", "suggestedValue": "<string>", '
        '"reason": "<short human-readable reason>", "confidence": <0..1>}'
    )


async def review_rows(
    rows: list[dict], category_names: list[str], workspace_id: str
) -> list[dict]:
    """rows: [{index, name, description, amount, type, hasCategoryId}, ...].

    Returns suggestion dicts (field "category" carries a category NAME —
    the caller resolves it to a real categoryId, since only the caller has
    the id↔name mapping). Returns [] on empty input, no categories, or a
    non-quota failure. Re-raises PlanLimitReached so the caller can report a
    precise "quota exceeded" degrade reason instead of a generic failure.
    """
    if not rows or not category_names:
        return []

    batch = rows[:MAX_ROWS]
    system = (
        "You are a precise financial transaction reviewer for an Indonesian "
        "finance app. Respond with ONLY a JSON array, no prose."
    )
    try:
        raw = await llm.complete_metered(
            system,
            [{"role": "user", "content": _build_prompt(batch, category_names)}],
            workspace_id,
            max_tokens=2048,
        )
    except PlanLimitReached:
        raise
    except Exception as e:  # noqa: BLE001 — model/timeout/bad-JSON, not quota
        log.error("review_rows failed: %s", e)
        return []

    parsed = extract_json(raw) or []
    if not isinstance(parsed, list):
        return []

    valid_indices = {r["index"] for r in batch}
    valid_categories = set(category_names)
    results = []
    for p in parsed:
        if not isinstance(p, dict):
            continue
        index = p.get("index")
        field = p.get("field")
        suggested = p.get("suggestedValue")
        if index not in valid_indices or field not in ("category", "type"):
            continue
        if field == "category" and suggested not in valid_categories:
            continue
        if field == "type" and suggested not in _VALID_TYPES:
            continue
        confidence = p.get("confidence")
        results.append(
            {
                "index": index,
                "field": field,
                "suggestedValue": suggested,
                "reason": str(p.get("reason") or ""),
                "confidence": confidence if isinstance(confidence, (int, float)) else None,
            }
        )
    return results
