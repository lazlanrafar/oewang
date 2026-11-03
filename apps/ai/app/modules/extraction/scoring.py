"""The quality score, and the confidence derived from it.

Pure functions. No model, no clock, no configuration: `today` is passed in
because a date's believability depends on it, and nothing else here reads
anything it was not given. That is what makes the ladder's escalation rule
testable without a provider (docs/ai/service.md#quality-score).

The weights are the doc's, and they add up to 100 exactly, so a receipt
with every scored field missing scores zero and a complete one scores 100.
A receipt with no merchant is still useful, because the user can type one.
A receipt with no total is not a receipt, and the weights say so.

Confidence is **computed here**, never asked for from the model. A model's
stated confidence is a sentence it generated, and a wrong extraction stated
confidently is exactly the failure this ladder exists to catch.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.modules.extraction.results import (
    CRITICAL_FIELDS,
    ExtractionResult,
    ReceiptResult,
    StatementResult,
    StatementRow,
    items_agree_with,
    valid_currency,
    valid_date,
)

#: `(missing, invalid)` per scored field. `None` for invalid means the
#: field has no invalid state: a merchant is a string, and any string the
#: document carried is a usable merchant name.
WEIGHTS: dict[str, tuple[int, int | None]] = {
    "total": (30, 15),
    "currency": (25, 10),
    "merchant": (20, None),
    "date": (15, 5),
    "line_items": (10, 5),
}

MAX_SCORE = 100

#: How much a missing critical field costs a result's confidence, on top of
#: what the score already lost. A result with no total is not 0.7 as
#: trustworthy as one with a total; it is a different kind of answer.
CRITICAL_CONFIDENCE_PENALTY = 0.15


@dataclass(frozen=True)
class Issues:
    """Which scored fields are missing and which are present but unusable.

    One pass over the result answers three questions at once: the score,
    the fields the confirmation sheet flags, and whether the ladder has
    anything left to target. Computing them separately would let them
    disagree.
    """

    missing: frozenset[str]
    invalid: frozenset[str]

    @property
    def flagged(self) -> tuple[str, ...]:
        """What the user is asked to check, in the weights' order so the
        most important field is named first (AI-11)."""
        both = self.missing | self.invalid
        return tuple(name for name in WEIGHTS if name in both)


def receipt_issues(result: ReceiptResult, today: date) -> Issues:
    missing: set[str] = set()
    invalid: set[str] = set()

    def judge(name: str, *, present: bool, usable: bool) -> None:
        if not present:
            missing.add(name)
        elif not usable:
            invalid.add(name)

    # A total of zero is not a purchase, so it is present-but-invalid
    # rather than a figure to hand on.
    judge(
        "total",
        present=result.total is not None or "total" in result.unreadable,
        usable=result.total is not None and result.total > 0,
    )
    judge(
        "currency",
        present=result.currency is not None or "currency" in result.unreadable,
        usable=valid_currency(result.currency) is not None,
    )
    judge(
        "merchant",
        present=result.merchant is not None,
        # No invalid state: `WEIGHTS` carries `None` for it, and
        # `_deduct` would raise rather than silently deduct nothing.
        usable=True,
    )
    judge(
        "date",
        present=result.date is not None or "date" in result.unreadable,
        usable=valid_date(result.date, today) is not None,
    )
    # Items are checked against the subtotal when there is one, because
    # that is what they sum to: tax and service are not line items.
    target = result.subtotal if result.subtotal is not None else result.total
    judge(
        "line_items",
        present=bool(result.line_items),
        usable=items_agree_with(result.line_items, target),
    )

    return Issues(missing=frozenset(missing), invalid=frozenset(invalid))


def row_is_valid(row: StatementRow, today: date) -> bool:
    """A statement row counts when it carries a date and an amount.

    A description is nice and a direction is useful, but a row without a
    date or an amount is not a transaction anybody can import.
    """
    return valid_date(row.date, today) is not None and row.amount is not None


def calculate_quality_score(result: ExtractionResult, *, today: date) -> int:
    """A single number from 0 to 100.

    A receipt starts at 100 and deducts per field, weighted by how much
    the field matters. A statement scores as the share of its rows that
    are valid, because a statement has no named fields to weigh: one page
    of forty rows where thirty-six read cleanly is a 90, and the four
    that did not are what the review screen is for.
    """
    if isinstance(result, StatementResult):
        if not result.rows:
            return 0
        valid = sum(1 for row in result.rows if row_is_valid(row, today))
        return round(MAX_SCORE * valid / len(result.rows))

    issues = receipt_issues(result, today)
    score = MAX_SCORE
    for name, (missing, invalid) in WEIGHTS.items():
        if name in issues.missing:
            score -= missing
        elif name in issues.invalid:
            if invalid is None:
                raise AssertionError(f"{name} has no invalid state but was marked invalid")
            score -= invalid
    return max(score, 0)


def low_confidence_fields(result: ExtractionResult, *, today: date) -> list[str]:
    """What the confirmation sheet highlights for the user to check.

    Empty for a statement: there is no field to point at, and naming every
    column of a forty-row page tells the user nothing the score has not
    already said.
    """
    if isinstance(result, StatementResult):
        return []
    return list(receipt_issues(result, today).flagged)


def confidence(result: ExtractionResult, *, today: date) -> float:
    """How much this result is worth against another, from 0 to 1.

    Derived from the result's own score and its missing critical fields,
    which is the merge's only input besides the values themselves
    (docs/ai/service.md#merging-two-results).

    A float, deliberately: this is a weight in a comparison, not money.
    Nothing computed here reaches a ledger (D12).
    """
    score = calculate_quality_score(result, today=today) / MAX_SCORE
    if isinstance(result, StatementResult):
        return max(0.0, min(1.0, score))

    issues = receipt_issues(result, today)
    penalty = CRITICAL_CONFIDENCE_PENALTY * len(set(CRITICAL_FIELDS) & issues.missing)
    return max(0.0, min(1.0, score - penalty))


__all__ = [
    "CRITICAL_CONFIDENCE_PENALTY",
    "Issues",
    "MAX_SCORE",
    "WEIGHTS",
    "calculate_quality_score",
    "confidence",
    "low_confidence_fields",
    "receipt_issues",
    "row_is_valid",
]
