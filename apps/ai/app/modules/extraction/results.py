"""What an extraction pass produced, before it is scored or merged.

Deliberately not the wire shape. A pass has to be able to say three
different things about a field, and the wire shape can only say two:

- absent, because the document does not carry it;
- present and usable;
- present and unusable, because the model answered with something this
  service will not read as a date or an amount.

The third one is why `unreadable` exists. The quality score deducts less
for a field that is there but wrong than for one that is missing
(docs/ai/service.md#quality-score), and collapsing the two at parse time
would throw that distinction away before anything could score it.

Money is `Decimal` here and a string on the wire. Nothing in this module
parses an amount into a float, and `parse_money` refuses anything it is not
certain of rather than guessing: a grouping separator read as a decimal
point moves a receipt's total by three orders of magnitude (D12).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

#: The scalar fields a receipt is scored and merged on, in no particular
#: order. `line_items` is handled separately everywhere, because it is a
#: list and none of the scalar rules apply to it.
RECEIPT_SCALARS = ("total", "subtotal", "tax", "merchant", "date", "currency")

#: The fields the score has a weight for, which is a smaller set:
#: `subtotal` and `tax` are useful when present and cost nothing when
#: absent, so they are merged but not scored.
SCORED_FIELDS = ("total", "currency", "merchant", "date", "line_items")

#: Without these two there is nothing to confirm, which is what
#: `RECEIPT_UNREADABLE` means (AI-3).
CRITICAL_FIELDS = ("total", "date")

#: Four decimal places, matching the ledger's own scale and the examples in
#: docs/ai/service.md. A quantity is not money and keeps its own shape.
MONEY_EXPONENT = Decimal("0.0001")

#: Above this an amount is a parse failure rather than a purchase. It also
#: keeps `quantize` inside its precision, which raises rather than rounding
#: when the integer part is long enough.
MAX_AMOUNT = Decimal("1e15")

#: A plain decimal, which is the only thing `parse_money` accepts. No
#: grouping separators, no comma as a decimal point, no trailing currency.
#: "87.500" is 87500 on an Indonesian receipt and 87.5 on an American one,
#: and no amount of context in this process can tell which, so neither is
#: read: absent beats guessed, for every field.
_PLAIN_DECIMAL = re.compile(r"^-?\d+(?:\.\d+)?$")

#: The one plain decimal that is still not read: up to three digits, a
#: dot, and exactly three more. The prompt asks for a dot as the decimal
#: point, so `87.500` from an obedient model is 87.5, and from a model
#: that copied an Indonesian receipt verbatim it is 87,500. Nothing in
#: this process can tell which, the two differ by a thousand, and a
#: receipt total is written to two decimal places or none. So it is
#: refused, the field is flagged, and the targeted pass re-asks for it.
_AMBIGUOUS_GROUPING = re.compile(r"^-?\d{1,3}\.\d{3}$")

#: Stripped before the pattern above is tried. A symbol is a currency hint,
#: not part of the number.
_AMOUNT_NOISE = re.compile(r"[\s ]|^(?:Rp|IDR|USD|EUR|SGD|AUD|MYR|\$|€|£|¥)", re.IGNORECASE)

_ISO_DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")

#: An ISO 4217 code, as far as a string can be checked without a table.
_CURRENCY_CODE = re.compile(r"^[A-Z]{3}$")

#: How far either side of `today` a receipt date is believable. A receipt
#: dated tomorrow is a misread year or a misread day; one dated eleven
#: years ago is not being captured now. The forward tolerance is a day
#: because `today` is UTC and the shop was not (docs/ai/service.md).
FUTURE_TOLERANCE = timedelta(days=1)
PAST_TOLERANCE = timedelta(days=3653)

#: How far line items may sum from the figure they are checked against
#: before the list counts as invalid. Relative, because a rounding
#: difference on a 2,000,000 rupiah bill is not the same size as one on a
#: 20,000 rupiah bill, with an absolute floor for the small end.
ITEM_SUM_TOLERANCE = Decimal("0.01")
ITEM_SUM_FLOOR = Decimal("1")


@dataclass(frozen=True)
class LineItem:
    """One line of a receipt. Every part is optional: a list of names with
    no amounts is still worth showing the user."""

    name: str | None = None
    amount: Decimal | None = None
    quantity: Decimal | None = None
    unit_price: Decimal | None = None


@dataclass(frozen=True)
class ReceiptResult:
    """One pass's reading of one receipt.

    `date` stays a string rather than a `datetime.date` because "present
    but not a date this service will read" has to survive as far as the
    score. It leaves on the wire only when it validates.
    """

    merchant: str | None = None
    date: str | None = None
    total: Decimal | None = None
    subtotal: Decimal | None = None
    tax: Decimal | None = None
    currency: str | None = None
    line_items: tuple[LineItem, ...] = ()
    #: Fields the pass answered for with something unusable. Scored as
    #: present-but-invalid rather than missing.
    unreadable: frozenset[str] = frozenset()


@dataclass(frozen=True)
class StatementRow:
    date: str | None = None
    description: str | None = None
    amount: Decimal | None = None
    direction: str | None = None


@dataclass(frozen=True)
class StatementResult:
    """One pass's reading of one statement page.

    A statement has no named fields to score, so there is no `unreadable`
    here: a row this service could not read is simply an invalid row, and
    the score is the share of rows that are valid.
    """

    rows: tuple[StatementRow, ...] = ()


ExtractionResult = ReceiptResult | StatementResult


# ------------------------------------------------------------------ money


def parse_money(raw: object) -> Decimal | None:
    """A decimal, or `None` when the text is not one this service will read.

    `None` is not an error. It is the parser declining to guess, which is
    the whole rule: a misread separator is a wrong number that looks like a
    right one, and the caller turns a `None` into a flagged field the user
    can correct.
    """
    if isinstance(raw, Decimal):
        value = raw
    elif isinstance(raw, str):
        text = _AMOUNT_NOISE.sub("", raw.strip())
        if not _PLAIN_DECIMAL.match(text) or _AMBIGUOUS_GROUPING.match(text):
            return None
        try:
            value = Decimal(text)
        except InvalidOperation:
            return None
    else:
        # A bool, a list, a dict, or a float that got past `parse_float`.
        # None of them is an amount, and a float least of all.
        return None

    if not value.is_finite() or abs(value) >= MAX_AMOUNT:
        return None
    return value


def format_money(value: Decimal) -> str:
    """Four decimal places, as a string. Never a JSON number (D12)."""
    return str(value.quantize(MONEY_EXPONENT, rounding=ROUND_HALF_UP))


def format_quantity(value: Decimal) -> str:
    """A quantity keeps the shape it was written in: `1`, not `1.0000`.

    `:f` rather than `str`, because a normalized `Decimal` prints as
    `1E+1` for ten and nobody wants that on a confirmation sheet.
    """
    return f"{value.normalize():f}"


# ------------------------------------------------------------------- dates


def parse_iso_date(raw: str | None) -> date | None:
    """A real calendar date from `YYYY-MM-DD`, or `None`.

    Only that one format. Everything else, including an unambiguous-looking
    `02/11/2026`, is left to whichever layer knows the convention it was
    written in.
    """
    if not raw:
        return None
    match = _ISO_DATE.match(raw.strip())
    if match is None:
        return None
    try:
        return date(int(match[1]), int(match[2]), int(match[3]))
    except ValueError:
        return None


def date_in_range(value: date, today: date) -> bool:
    return today - PAST_TOLERANCE <= value <= today + FUTURE_TOLERANCE


def valid_date(raw: str | None, today: date) -> date | None:
    """The date, when it both parses and is believable. Otherwise `None`."""
    parsed = parse_iso_date(raw)
    if parsed is None or not date_in_range(parsed, today):
        return None
    return parsed


# ---------------------------------------------------------------- the rest


def valid_currency(raw: str | None) -> str | None:
    if not raw:
        return None
    code = raw.strip().upper()
    return code if _CURRENCY_CODE.match(code) else None


def item_sum(items: tuple[LineItem, ...]) -> Decimal | None:
    """What the line items add up to, or `None` when none of them carries
    an amount. Addition over `Decimal`, which is exact."""
    amounts = [item.amount for item in items if item.amount is not None]
    if not amounts:
        return None
    return sum(amounts, Decimal(0))


def items_agree_with(items: tuple[LineItem, ...], target: Decimal | None) -> bool:
    """Do the items sum close enough to `target`?

    This is a reading of the result, never a correction of it. Arithmetic
    that changes a figure belongs to the API's consistency pass in Rust
    (D30, AI-7), and this service does not do it.
    """
    total = item_sum(items)
    if total is None or target is None:
        return False
    tolerance = max(abs(target) * ITEM_SUM_TOLERANCE, ITEM_SUM_FLOOR)
    return abs(total - target) <= tolerance


def total_is_corroborated(result: ReceiptResult) -> bool:
    """Does this reading's total agree with the rest of this reading?

    The doc's close-confidence rule for `total` is "prefer the value that
    agrees with the sum of the line items"
    (docs/ai/service.md#merging-two-results). Taken literally that rule
    never fires on a receipt with tax on it, because the items sum to the
    subtotal and the total is the subtotal plus the tax. So the
    comparison is against the whole of the rest of the reading: the
    printed subtotal when there is one, the items when there is not, plus
    the tax when there is one.

    A comparison, not a correction. It decides which of two figures the
    models gave is kept; nothing here replaces a figure with a computed
    one, which is the API's consistency pass (D30, AI-7).
    """
    if result.total is None:
        return False
    base = result.subtotal if result.subtotal is not None else item_sum(result.line_items)
    if base is None:
        return False
    expected = base + (result.tax or Decimal(0))
    tolerance = max(abs(expected) * ITEM_SUM_TOLERANCE, ITEM_SUM_FLOOR)
    return abs(result.total - expected) <= tolerance


def blank_to_none(raw: object, *, limit: int) -> str | None:
    """A trimmed string, clamped, or `None` when there is nothing in it."""
    if not isinstance(raw, str):
        return None
    text = " ".join(raw.split())[:limit]
    return text or None


def empty_result(kind: str) -> ExtractionResult:
    """What a document nothing could be read from looks like."""
    return ReceiptResult() if kind == "receipt" else StatementResult()


def with_field(result: ReceiptResult, name: str, value: object) -> ReceiptResult:
    """One field replaced, and that field dropped from `unreadable`.

    Used by the targeted pass, which re-asks for one field at a time.
    """
    unreadable = result.unreadable - {name}
    return replace(result, unreadable=unreadable, **{name: value})


__all__ = [
    "CRITICAL_FIELDS",
    "ExtractionResult",
    "LineItem",
    "MONEY_EXPONENT",
    "RECEIPT_SCALARS",
    "ReceiptResult",
    "SCORED_FIELDS",
    "StatementResult",
    "StatementRow",
    "blank_to_none",
    "date_in_range",
    "empty_result",
    "format_money",
    "format_quantity",
    "item_sum",
    "items_agree_with",
    "parse_iso_date",
    "parse_money",
    "total_is_corroborated",
    "valid_currency",
    "valid_date",
    "with_field",
]
