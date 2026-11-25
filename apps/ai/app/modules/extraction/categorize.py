"""Which of the workspace's categories a saved receipt belongs to (D86).

Used by the Telegram receipt flow, which saves a receipt without a review
sheet and so needs a category to show. One small call over strings that
were already read: the merchant, the item names, and the workspace's own
expense category names. It is not the ladder and it never sees the image.

What makes it safe to act on is what happens to the answer. The model may
only name one of the categories it was shown; anything else is dropped
here, and the API maps the name back to an id by exact match and leaves
the transaction uncategorised when nothing matches. The user sees the
category on the reply and changes it with one tap. A wrong guess costs a
tap; it cannot move money or reach anything else.

The same call can answer one category per item instead (TXN-27), for the
items the API found no history for (TXN-29). The rules are the same ones:
each answer is a name from the list or nothing, and the API maps it to an
id. A proposal is shown on the confirmation sheet, or written to an item
that had no category; it moves no money either way.

The merchant and the item names were printed by somebody else, so both
calls have `tools=[]` like every call in this package (D24, SEC-21).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.config import Settings
from app.core import model
from app.modules.extraction.parsing import AnswerUnparsable, answer_text, load_object
from app.modules.extraction.prompts import UNTRUSTED_INPUT

logger = logging.getLogger("oewang.ai.extraction")

#: One short JSON object comes back. A ceiling on it bounds how long the
#: user waits for the "Saved" reply.
MAX_OUTPUT_TOKENS = 128

SYSTEM_PROMPT = f"""\
You file a purchase under one of a fixed list of expense categories. You
are given the merchant name, the item names from the receipt, and the
category names. You answer with one JSON object and nothing else.

{UNTRUSTED_INPUT}

Rules:
1. "category" is one name copied exactly from "categories", character for
   character, including any emoji. Never invent one, never reword one.
2. Pick the category a person would file this purchase under: a
   restaurant or a cafe is food, a pharmacy is health, a fuel station or a
   ride is transport, a supermarket is groceries or shopping, a phone or
   electricity bill is bills.
3. If no category fits, or the list is empty, answer {{"category": null}}.
   null is better than a wrong category.

Example.

Input: {{"merchant": "HOLAN BY MEVUI", "items": ["MINERAL WATER (Bottle)",
"PHO SG - SPECIAL", "SPRITE"], "categories": ["🍜 Food", "🛍️ Shopping",
"🧾 Bills", "🛵 Transport", "📦 Other"]}}
Output: {{"category": "🍜 Food"}}"""

#: One short name per item, up to `MAX_CATEGORIZE_ITEMS` of them.
MAX_ITEMS_OUTPUT_TOKENS = 1024

ITEMS_SYSTEM_PROMPT = f"""\
You file each line of a receipt under one of a fixed list of categories.
You are given the merchant name, the numbered item names, and the category
names. You answer with one JSON object and nothing else.

{UNTRUSTED_INPUT}

Rules:
1. Answer {{"items": {{...}}}} with the same numbers as keys. Each value is
   one name copied exactly from "categories", character for character,
   including any emoji, or null. Never invent one, never reword one.
2. Judge each item by what it is, not by the shop: cigarettes bought at a
   supermarket are not groceries, medicine bought there is health.
3. If no category fits an item, or you cannot tell what the item is, its
   value is null. null is better than a wrong category.

Example.

Input: {{"merchant": "SUPERINDO", "items": {{"1": "BERAS 5KG", "2": "SAMPOERNA
MILD 16", "3": "PCT 500MG", "4": "X7 PRM"}}, "categories": ["🛒 Groceries",
"🚬 Cigarettes", "💊 Health", "📦 Other"]}}
Output: {{"items": {{"1": "🛒 Groceries", "2": "🚬 Cigarettes", "3": "💊 Health",
"4": null}}}}"""


class CategorizeFailed(Exception):
    """The model did not answer in the agreed shape. Carries no text."""


def build_user_message(merchant: str | None, items: list[str], categories: list[str]) -> str:
    return json.dumps(
        {"merchant": merchant, "items": items, "categories": categories},
        ensure_ascii=False,
        separators=(",", ":"),
    )


def clean_category(body: dict[str, Any], categories: list[str]) -> str | None:
    """The answer, if it is one of the names shown. Otherwise nothing."""
    value = body.get("category")
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value if value in categories else None


def build_items_message(merchant: str | None, items: list[str], categories: list[str]) -> str:
    """Items numbered from 1, so an answer names a line by its number and
    cannot drift when the model skips one."""
    numbered = {str(index): name for index, name in enumerate(items, start=1)}
    return json.dumps(
        {"merchant": merchant, "items": numbered, "categories": categories},
        ensure_ascii=False,
        separators=(",", ":"),
    )


def clean_items(body: dict[str, Any], count: int, categories: list[str]) -> list[str | None]:
    """One answer per item, in order. A line the model skipped, a name it
    was not shown and an answer in another shape are all nothing."""
    answers = body.get("items")
    if not isinstance(answers, dict):
        return [None] * count
    return [
        clean_category({"category": answers.get(str(index))}, categories)
        for index in range(1, count + 1)
    ]


async def categorize_items(
    *,
    merchant: str | None,
    items: list[str],
    categories: list[str],
    config: Settings,
) -> tuple[list[str | None], str, dict[str, object]]:
    """One call for every item. Returns a category name or `None` per item,
    the model used, and what the call cost.

    No call at all when there is nothing to file or nothing to choose from.
    """
    if not items or not categories:
        return [None] * len(items), config.ai_chat_model, model.usage_report(0, 0, None)

    message = await model.complete(
        model=config.ai_chat_model,
        max_tokens=MAX_ITEMS_OUTPUT_TOKENS,
        system=ITEMS_SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": build_items_message(merchant, items, categories)}
        ],
        tools=[],
    )

    try:
        body = load_object(answer_text(message))
    except AnswerUnparsable as error:
        logger.info("categorize answered outside the agreed shape")
        raise CategorizeFailed from error

    chosen = clean_items(body, len(items), categories)
    # How many, never which (OPS-3).
    logger.info(
        "categorize chose %d of %d items", sum(name is not None for name in chosen), len(items)
    )
    tokens_in, tokens_out = model.tokens_of(message)
    return chosen, config.ai_chat_model, model.usage_report(
        tokens_in, tokens_out, config.ai_chat_model
    )


async def categorize(
    *,
    merchant: str | None,
    items: list[str],
    categories: list[str],
    config: Settings,
) -> tuple[str | None, str, dict[str, object]]:
    """One call. Returns the category name, or `None`, the model used, and
    what the call cost.

    No call at all when there is nothing to choose from.
    """
    if not categories:
        return None, config.ai_chat_model, model.usage_report(0, 0, None)

    message = await model.complete(
        model=config.ai_chat_model,
        max_tokens=MAX_OUTPUT_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_user_message(merchant, items, categories)}],
        tools=[],
    )

    try:
        body = load_object(answer_text(message))
    except AnswerUnparsable as error:
        logger.info("categorize answered outside the agreed shape")
        raise CategorizeFailed from error

    category = clean_category(body, categories)
    # Whether it chose, never what: a category name is the workspace's own
    # content (OPS-3).
    logger.info("categorize chose %s of %d", "one" if category else "none", len(categories))
    tokens_in, tokens_out = model.tokens_of(message)
    return category, config.ai_chat_model, model.usage_report(
        tokens_in, tokens_out, config.ai_chat_model
    )


__all__ = [
    "ITEMS_SYSTEM_PROMPT",
    "MAX_ITEMS_OUTPUT_TOKENS",
    "MAX_OUTPUT_TOKENS",
    "SYSTEM_PROMPT",
    "CategorizeFailed",
    "build_items_message",
    "build_user_message",
    "categorize",
    "categorize_items",
    "clean_category",
    "clean_items",
]
