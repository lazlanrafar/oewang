"""The model's answer, read into a result.

Two rules shape everything here.

**No float, ever.** `json.loads` is called with `parse_float=Decimal` and
`parse_int=Decimal`, so a model that wrote `87500.00` without quotes still
never produces a float. Without that argument the amount has already been
through a binary double by the time any of this code sees it, and the
damage is not visible afterwards (D12).

**A field this parser will not read is not dropped silently.** It goes in
`unreadable`, which the score treats as present-but-invalid rather than
missing, and which the ladder's targeted pass uses to decide what to
re-ask for. A parser that quietly returned `None` would make a model that
answered badly indistinguishable from a receipt that carries nothing.

Nothing here raises on bad content. A model answer that is not JSON at all
raises `AnswerUnparsable`, which the ladder counts as a failed pass; an
answer that is JSON but wrong in places produces a result with those
places marked.
"""

from __future__ import annotations

import json
import re
from decimal import Decimal
from typing import Any

from app.modules.extraction.results import (
    LineItem,
    ReceiptResult,
    StatementResult,
    StatementRow,
    blank_to_none,
    parse_money,
)

#: A fenced block, which the prompts ask the model not to produce and
#: which it sometimes produces anyway. Cheaper to strip than to spend a
#: whole pass on.
_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL)

#: Clamps. A merchant name is a label, not a document, and a model that
#: answered with a paragraph is answering wrongly whatever it says.
MAX_MERCHANT = 200
MAX_ITEM_NAME = 200
MAX_DESCRIPTION = 500

#: The most line items or statement rows one answer may carry. A page of a
#: statement does not hold a thousand rows, and a model that says it does
#: has started generating rather than reading.
MAX_LINE_ITEMS = 200
MAX_ROWS = 500

DIRECTIONS = ("income", "expense")


class AnswerUnparsable(Exception):
    """The answer was not a JSON object. Counts as a failed pass.

    Carries no text: a parse failure's natural message is the thing that
    failed to parse, which here is model output about somebody's receipt
    (OPS-3).
    """


def answer_text(message: Any) -> str:
    """The text blocks of a finished message, joined.

    Works against the SDK's objects and against a test's scripted
    stand-ins, which is why it reads attributes defensively rather than
    typing the message.
    """
    parts = []
    for block in getattr(message, "content", None) or []:
        if getattr(block, "type", None) == "text":
            parts.append(getattr(block, "text", "") or "")
    return "".join(parts)


def load_object(text: str) -> dict[str, Any]:
    """The JSON object in `text`, with every number a `Decimal`.

    Tolerates a code fence and leading or trailing prose, because the cost
    of not tolerating them is an entire model pass.
    """
    fenced = _FENCE.match(text)
    candidate = fenced[1] if fenced else text

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start < 0 or end <= start:
        raise AnswerUnparsable

    try:
        loaded = json.loads(
            candidate[start : end + 1],
            # The line that keeps a float out of the parse path (D12).
            parse_float=Decimal,
            parse_int=Decimal,
        )
    except ValueError as error:
        raise AnswerUnparsable from error

    if not isinstance(loaded, dict):
        raise AnswerUnparsable
    return loaded


# --------------------------------------------------------------- receipts


def _money_field(body: dict[str, Any], key: str, unreadable: set[str]) -> Decimal | None:
    """One amount, or `None` with the field marked when it is not one."""
    if key not in body or body[key] is None:
        return None
    value = parse_money(body[key])
    if value is None:
        unreadable.add(key)
    return value


def _line_items(raw: Any) -> tuple[LineItem, ...]:
    """The items, keeping every line that carries anything at all.

    A line with a name and no amount is still worth showing: the user
    recognises their own order and types the figure. A line with neither
    is dropped, because it is nothing.
    """
    if not isinstance(raw, list):
        return ()

    items = []
    for entry in raw[:MAX_LINE_ITEMS]:
        if not isinstance(entry, dict):
            continue
        item = LineItem(
            name=blank_to_none(entry.get("name"), limit=MAX_ITEM_NAME),
            amount=parse_money(entry.get("amount")),
            quantity=parse_money(entry.get("quantity")),
            unit_price=parse_money(entry.get("unit_price")),
        )
        if item.name is None and item.amount is None:
            continue
        items.append(item)
    return tuple(items)


def parse_receipt(body: dict[str, Any]) -> ReceiptResult:
    """A receipt answer, read as far as it can be read.

    `date` is kept as whatever string the model wrote, trimmed. Validating
    it is the score's job, and an unbelievable date has to survive this
    far to be scored as present-but-invalid rather than missing.
    """
    unreadable: set[str] = set()

    raw_date = body.get("date")
    date_text = blank_to_none(raw_date, limit=32)
    if raw_date is not None and date_text is None:
        unreadable.add("date")

    raw_currency = body.get("currency")
    currency = blank_to_none(raw_currency, limit=16)
    if raw_currency is not None and currency is None:
        unreadable.add("currency")

    return ReceiptResult(
        merchant=blank_to_none(body.get("merchant"), limit=MAX_MERCHANT),
        date=date_text,
        total=_money_field(body, "total", unreadable),
        subtotal=_money_field(body, "subtotal", unreadable),
        tax=_money_field(body, "tax", unreadable),
        currency=currency.upper() if currency else None,
        line_items=_line_items(body.get("line_items")),
        unreadable=frozenset(unreadable),
    )


#: What a targeted answer is read as, per field. `line_items` is a list and
#: the rest are scalars, so they do not share a reader.
def parse_targeted(field: str, body: dict[str, Any]) -> object | None:
    """One field out of a targeted answer, or `None`.

    An empty object is the prompt's own "I could not read it", so it
    arrives here as a missing key and leaves as `None`.
    """
    parsed = parse_receipt(body)
    value = getattr(parsed, field, None)
    if field == "line_items":
        return value or None
    return value


# -------------------------------------------------------------- statements


def _row(entry: dict[str, Any]) -> StatementRow | None:
    amount = parse_money(entry.get("amount"))
    direction = blank_to_none(entry.get("direction"), limit=16)
    if direction is not None:
        direction = direction.lower()
        if direction not in DIRECTIONS:
            direction = None

    # A negative amount is the statement's own sign convention rather than
    # a negative purchase, so the sign becomes the direction and the
    # figure becomes its magnitude. Flipping the sign is not arithmetic on
    # a value: it is reading the column the value came from.
    if amount is not None and amount < 0:
        amount = -amount
        direction = direction or "expense"

    row = StatementRow(
        date=blank_to_none(entry.get("date"), limit=32),
        description=blank_to_none(entry.get("description"), limit=MAX_DESCRIPTION),
        amount=amount,
        direction=direction,
    )
    if row.date is None and row.amount is None and row.description is None:
        return None
    return row


def parse_statement(body: dict[str, Any]) -> StatementResult:
    raw = body.get("rows")
    if not isinstance(raw, list):
        return StatementResult()

    rows = []
    for entry in raw[:MAX_ROWS]:
        if not isinstance(entry, dict):
            continue
        row = _row(entry)
        if row is not None:
            rows.append(row)
    return StatementResult(rows=tuple(rows))


__all__ = [
    "AnswerUnparsable",
    "DIRECTIONS",
    "MAX_LINE_ITEMS",
    "MAX_ROWS",
    "answer_text",
    "load_object",
    "parse_receipt",
    "parse_statement",
    "parse_targeted",
]
