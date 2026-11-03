"""The quality score, with no model anywhere near it (US-033b).

This is the function the ladder's escalation rule is made of: pass 1
returns when the score reaches the threshold, pass 2 escalates further
when it was below half of it. If this is wrong, every pass is wrong, and
it is pure, so it can be wrong in a way a test catches.

A complete receipt scores 100. Each missing field deducts its stated
weight (docs/ai/service.md#quality-score). Those two sentences are the
spec and they are the first two tests.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date
from decimal import Decimal

import pytest

from app.modules.extraction.parsing import parse_receipt, parse_statement
from app.modules.extraction.results import LineItem, ReceiptResult, StatementResult, StatementRow
from app.modules.extraction.scoring import (
    WEIGHTS,
    calculate_quality_score,
    confidence,
    low_confidence_fields,
    receipt_issues,
)
from tests.extraction_support import fixture_json

TODAY = date(2026, 11, 3)


def complete() -> ReceiptResult:
    return parse_receipt(fixture_json("receipt_clean.json"))


def score(result: ReceiptResult | StatementResult) -> int:
    return calculate_quality_score(result, today=TODAY)


# ------------------------------------------------------------- the weights


def test_the_weights_add_up_to_a_hundred() -> None:
    """Not arithmetic trivia: it is what makes "a receipt with nothing on
    it scores zero" true rather than approximately true."""
    assert sum(missing for missing, _ in WEIGHTS.values()) == 100


def test_a_complete_receipt_scores_one_hundred() -> None:
    assert score(complete()) == 100


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("total", None),
        ("currency", None),
        ("merchant", None),
        ("date", None),
        ("line_items", ()),
    ],
)
def test_each_missing_field_deducts_its_stated_weight(field: str, value: object) -> None:
    missing, _ = WEIGHTS[field]
    thinned = replace(complete(), **{field: value})

    assert score(thinned) == 100 - missing


def test_an_empty_receipt_scores_zero() -> None:
    assert score(ReceiptResult()) == 0


# ------------------------------------------------- present but unusable


def test_an_unreadable_total_costs_less_than_a_missing_one() -> None:
    """The distinction the result type exists for. A model that answered
    `"total": "about 87 thousand"` saw a total; it is the reading that
    failed, and the ladder can target a reading."""
    missing = replace(complete(), total=None)
    unusable = replace(complete(), total=None, unreadable=frozenset({"total"}))

    assert score(missing) == 70
    assert score(unusable) == 85


def test_a_total_of_zero_is_present_but_invalid() -> None:
    assert score(replace(complete(), total=Decimal(0))) == 85


def test_a_currency_that_is_not_a_code_is_invalid_not_missing() -> None:
    assert score(replace(complete(), currency="rupiah")) == 90


@pytest.mark.parametrize("raw", ["02/11/2026", "2026-13-02", "not a date"])
def test_a_date_this_service_will_not_read_is_invalid(raw: str) -> None:
    assert score(replace(complete(), date=raw)) == 95


def test_a_date_outside_a_believable_range_is_invalid() -> None:
    """A receipt dated next year is a misread year, not a purchase."""
    assert score(replace(complete(), date="2031-01-04")) == 95
    assert score(replace(complete(), date="2009-01-04")) == 95


def test_items_that_do_not_sum_to_the_subtotal_are_invalid() -> None:
    wrong = replace(
        complete(),
        line_items=(LineItem(name="Iga bakar", amount=Decimal("45000")),),
    )
    assert score(wrong) == 95


def test_items_are_checked_against_the_total_when_there_is_no_subtotal() -> None:
    """Tax and service are not line items, so the items sum to the
    subtotal when one is printed and to the total when none is."""
    assert score(parse_receipt(fixture_json("receipt_cafe.json"))) == 100


def test_a_wrong_total_is_not_detected_by_the_score() -> None:
    """Deliberate, and the reason is in the layering.

    `receipt_wrong_total.json` states 62,000 against items of 116,000 and
    tax of 11,600. The items agree with the printed subtotal, so nothing
    this function looks at is inconsistent, and it scores 100.

    Catching that the printed total disagrees with subtotal plus tax is
    cross-field consistency, which is the API's pure Rust pass (D30,
    AI-7). It is deliberately not here. If a later change makes this test
    fail by "fixing" the total in Python, the fix is in the wrong layer:
    two layers correcting the same number is how a user ends up unable to
    tell which figure came off the receipt.
    """
    result = parse_receipt(fixture_json("receipt_wrong_total.json"))

    assert score(result) == 100
    assert result.total == Decimal("62000.00"), "surfaced as printed, not corrected"


# ------------------------------------------------------------- statements


def test_a_statement_scores_the_share_of_valid_rows() -> None:
    """One of four rows carries both a date and an amount."""
    assert score(parse_statement(fixture_json("statement_poor.json"))) == 25


def test_a_clean_statement_scores_one_hundred() -> None:
    assert score(parse_statement(fixture_json("statement_clean.json"))) == 100


def test_a_statement_with_no_rows_scores_zero() -> None:
    assert score(StatementResult()) == 0


def test_a_row_needs_both_a_date_and_an_amount() -> None:
    rows = StatementResult(
        rows=(
            StatementRow(date="2026-11-02", amount=Decimal("1")),
            StatementRow(date="2026-11-02"),
            StatementRow(amount=Decimal("1")),
            StatementRow(date="02/11/2026", amount=Decimal("1")),
        )
    )
    assert score(rows) == 25


# ------------------------------------------------- flags and confidence


def test_the_flagged_fields_are_named_in_weight_order() -> None:
    """The confirmation sheet asks about the most important field first
    (AI-11)."""
    thin = replace(complete(), date=None, total=None, merchant=None)

    assert low_confidence_fields(thin, today=TODAY) == ["total", "merchant", "date"]


def test_a_complete_receipt_flags_nothing() -> None:
    assert low_confidence_fields(complete(), today=TODAY) == []


def test_a_statement_flags_no_fields() -> None:
    """There is no field to point at on a forty-row page, and naming
    every column would say less than the score already does."""
    poor = parse_statement(fixture_json("statement_poor.json"))
    assert low_confidence_fields(poor, today=TODAY) == []


def test_confidence_follows_the_score() -> None:
    assert confidence(complete(), today=TODAY) == pytest.approx(1.0)


def test_a_missing_critical_field_costs_confidence_beyond_the_score() -> None:
    """A result with no total is not "70% as trustworthy"; it is a
    different kind of answer, and the merge has to weigh it as one."""
    without_total = replace(complete(), total=None)

    assert calculate_quality_score(without_total, today=TODAY) == 70
    assert confidence(without_total, today=TODAY) == pytest.approx(0.55)


def test_nothing_in_the_score_touches_a_float() -> None:
    """The guard for D12 at the layer that does the comparing: every
    amount the scorer looks at is a `Decimal`."""
    result = complete()
    amounts = [result.total, result.subtotal, result.tax]
    amounts += [item.amount for item in result.line_items]

    assert all(isinstance(value, Decimal) for value in amounts)


def test_the_issues_of_a_complete_receipt_are_empty() -> None:
    issues = receipt_issues(complete(), TODAY)
    assert not issues.missing and not issues.invalid
