"""Merging two passes' readings of the same document.

Pass 2 produces a second result, not a replacement
(docs/ai/service.md#merging-two-results). Two models reading the same
photograph are wrong about different fields, so taking the second answer
whole would throw away a merchant the first one read perfectly to gain a
total the second one read better.

The rules, in order:

1. Present in one and absent in the other: take the present one.
2. Both present and the confidences differ by more than 0.1: take the
   higher-confidence result's value.
3. Both present and the confidences are close: the field decides. The
   total that agrees with its own line items; the date inside a believable
   range; the longer merchant, because truncation is the common failure.
4. Line items: the longer list.

Rule 3 is the interesting one and it is worth saying why each rule is what
it is. A total agreeing with the items it was read alongside is the one
piece of corroboration a single image offers. A merchant name is cut short
far more often than it is extended, so longer is almost always more
complete. A date outside a believable range is a misread year, and there
is no reading in which it is right.

Nothing here corrects a value. Taking the total that agrees with the line
items is choosing between two things the model said; replacing a total
with the sum of the items is arithmetic, it belongs to the API's
consistency pass in Rust (D30, AI-7), and it does not happen in this
process.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date

from app.modules.extraction.results import (
    RECEIPT_SCALARS,
    ReceiptResult,
    StatementResult,
    total_is_corroborated,
    valid_date,
)
from app.modules.extraction.scoring import confidence, row_is_valid

#: Closer than this and the confidences are "close", so the field-specific
#: rules decide instead of the numbers (rule 2 against rule 3).
CLOSE_CONFIDENCE = 0.1


def _present(result: ReceiptResult, name: str) -> bool:
    return getattr(result, name) is not None


def _pick_total(left: ReceiptResult, right: ReceiptResult) -> ReceiptResult:
    """The total that agrees with the rest of the reading it came from.

    The doc says "the sum of the line items"; `total_is_corroborated`
    says why that is the printed subtotal plus the tax when the receipt
    carries both.
    """
    left_agrees = total_is_corroborated(left)
    right_agrees = total_is_corroborated(right)
    if left_agrees == right_agrees:
        return left
    return left if left_agrees else right


def _pick_date(left: ReceiptResult, right: ReceiptResult, today: date) -> ReceiptResult:
    """The date inside a believable range."""
    left_ok = valid_date(left.date, today) is not None
    right_ok = valid_date(right.date, today) is not None
    if left_ok == right_ok:
        return left
    return left if left_ok else right


def _pick_merchant(left: ReceiptResult, right: ReceiptResult) -> ReceiptResult:
    """The longer name. Truncation is the common failure, not invention."""
    return left if len(left.merchant or "") >= len(right.merchant or "") else right


def merge_receipts(first: ReceiptResult, second: ReceiptResult, *, today: date) -> ReceiptResult:
    """One result from two, field by field.

    `first` wins every tie. The caller passes the earlier pass first, so a
    tie keeps what the ladder already had rather than churning on equal
    evidence.
    """
    first_confidence = confidence(first, today=today)
    second_confidence = confidence(second, today=today)
    gap = first_confidence - second_confidence

    # Ordered so the more confident result is `leader` whenever rule 2
    # applies. Rule 3's helpers take `(left, right)` and return one of
    # them, with `left` winning a tie, so they are always handed
    # `(first, second)` rather than the confidence ordering: the
    # field-specific rules are the ones that ignore confidence.
    leader = first if gap >= 0 else second

    values: dict[str, object] = {}
    for name in RECEIPT_SCALARS:
        in_first = _present(first, name)
        in_second = _present(second, name)

        if in_first and not in_second:
            source = first
        elif in_second and not in_first:
            source = second
        elif not in_first and not in_second:
            values[name] = None
            continue
        elif abs(gap) > CLOSE_CONFIDENCE:
            source = leader
        elif name == "total":
            source = _pick_total(first, second)
        elif name == "date":
            source = _pick_date(first, second, today)
        elif name == "merchant":
            source = _pick_merchant(first, second)
        else:
            # Subtotal, tax and currency have no corroboration to appeal
            # to, so a close call keeps the earlier pass's reading.
            source = leader

        values[name] = getattr(source, name)

    # Rule 4. The longer list, because a pass that read ten lines saw more
    # of the receipt than one that read four. Consistency fixes on that
    # list are Rust's (D30).
    longer = first if len(first.line_items) >= len(second.line_items) else second
    items = longer.line_items

    # A field is still "present but unusable" only if it ended up with no
    # value and at least one pass answered for it with something.
    unreadable = frozenset(
        name
        for name in RECEIPT_SCALARS
        if values[name] is None and (name in first.unreadable or name in second.unreadable)
    )

    return replace(ReceiptResult(), line_items=items, unreadable=unreadable, **values)


def merge_statements(
    first: StatementResult, second: StatementResult, *, today: date
) -> StatementResult:
    """The page that read better, whole.

    Rows are not fields and they do not merge: two passes over a statement
    produce two orderings of overlapping rows, and matching them up is
    guessing which `WARUNG TEKKO 87500` is which. So the page with more
    valid rows wins, and the earlier pass wins a tie.

    Deliberately simpler than the receipt merge, and the reason is in the
    scoring: a statement's quality is a share of valid rows, so "better" is
    a single countable thing here in a way it is not for a receipt.
    """
    first_valid = sum(1 for row in first.rows if row_is_valid(row, today))
    second_valid = sum(1 for row in second.rows if row_is_valid(row, today))
    return first if first_valid >= second_valid else second


__all__ = ["CLOSE_CONFIDENCE", "merge_receipts", "merge_statements"]
