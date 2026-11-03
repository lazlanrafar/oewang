"""The merge rules, with known confidences (US-033b).

Pass 2 produces a second result, not a replacement. These tests pin the
four rules in docs/ai/service.md#merging-two-results, and in particular
the close-confidence rules for total, date, merchant and line items,
because those are the ones that decide what the user sees when two models
disagree and neither is obviously better.

Confidence is never asserted as a literal. It is computed from each
result's own quality score, so a test that hard-coded one would start
passing for the wrong reason the moment a weight changed. Instead each
case is built so the gap is unambiguously wide or unambiguously close,
and that is asserted first.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date
from decimal import Decimal

from app.modules.extraction.merging import CLOSE_CONFIDENCE, merge_receipts, merge_statements
from app.modules.extraction.parsing import parse_receipt, parse_statement
from app.modules.extraction.results import LineItem, ReceiptResult, StatementResult, StatementRow
from app.modules.extraction.scoring import confidence
from tests.extraction_support import fixture_json

TODAY = date(2026, 11, 3)


def complete() -> ReceiptResult:
    return parse_receipt(fixture_json("receipt_clean.json"))


def merge(first: ReceiptResult, second: ReceiptResult) -> ReceiptResult:
    return merge_receipts(first, second, today=TODAY)


def gap(first: ReceiptResult, second: ReceiptResult) -> float:
    return abs(confidence(first, today=TODAY) - confidence(second, today=TODAY))


# ---------------------------------------------------------------- rule 1


def test_a_field_present_in_one_result_only_is_taken() -> None:
    first = replace(complete(), merchant=None)
    second = replace(complete(), total=None, date=None)

    merged = merge(first, second)

    assert merged.merchant == "Warung Tekko"
    assert merged.total == Decimal("87500.00")
    assert merged.date == "2026-11-02"


def test_two_empty_results_merge_to_an_empty_result() -> None:
    merged = merge(ReceiptResult(), ReceiptResult())

    assert merged == ReceiptResult()


def test_a_field_neither_pass_could_read_stays_marked_unreadable() -> None:
    """Otherwise the merge would turn "both models saw a total and
    neither could read it" into "there was no total", which scores
    differently and gives pass 3 nothing to target."""
    first = replace(complete(), total=None, unreadable=frozenset({"total"}))
    second = replace(complete(), total=None)

    assert "total" in merge(first, second).unreadable


# ---------------------------------------------------------------- rule 2


def test_the_more_confident_result_wins_when_the_gap_is_wide() -> None:
    """A result missing the merchant, the currency and the items is far
    enough behind that its reading of the total is not worth weighing."""
    confident = complete()
    doubtful = replace(
        complete(), merchant=None, currency=None, line_items=(), total=Decimal("9999")
    )

    assert gap(confident, doubtful) > CLOSE_CONFIDENCE
    assert merge(doubtful, confident).total == Decimal("87500.00")
    assert merge(confident, doubtful).total == Decimal("87500.00")


# ---------------------------------------------------------------- rule 3


def test_a_close_call_on_the_total_prefers_the_one_the_items_agree_with() -> None:
    """The one piece of corroboration a single photograph offers."""
    agreeing = complete()
    disagreeing = replace(complete(), total=Decimal("8750"))

    assert gap(agreeing, disagreeing) <= CLOSE_CONFIDENCE
    assert merge(disagreeing, agreeing).total == Decimal("87500.00")


def test_a_close_call_on_the_date_prefers_the_believable_one() -> None:
    believable = complete()
    # Scores the same: an unbelievable date and an unreadable one both
    # cost five, so confidence cannot be what separates these two.
    future = replace(complete(), date="2031-01-04")

    assert gap(believable, future) <= CLOSE_CONFIDENCE
    assert merge(future, believable).date == "2026-11-02"


def test_a_close_call_on_the_merchant_prefers_the_longer_string() -> None:
    """Truncation is the common failure, not invention."""
    full = replace(complete(), merchant="Warung Tekko Sanur")
    cut = replace(complete(), merchant="Warung Tek")

    assert gap(full, cut) <= CLOSE_CONFIDENCE
    assert merge(cut, full).merchant == "Warung Tekko Sanur"
    assert merge(full, cut).merchant == "Warung Tekko Sanur"


def test_a_close_call_with_no_rule_keeps_the_earlier_pass() -> None:
    """Subtotal, tax and currency have nothing to appeal to, so the
    ladder does not churn on equal evidence."""
    first = replace(complete(), tax=Decimal("7500"))
    second = replace(complete(), tax=Decimal("7000"))

    assert gap(first, second) <= CLOSE_CONFIDENCE
    assert merge(first, second).tax == Decimal("7500")


# ---------------------------------------------------------------- rule 4


def test_line_items_take_the_longer_list() -> None:
    short = replace(complete(), line_items=complete().line_items[:1])
    long = complete()

    assert len(merge(short, long).line_items) == 3
    assert len(merge(long, short).line_items) == 3


def test_the_merge_never_corrects_a_figure() -> None:
    """The merge chooses between things the model said. Replacing a total
    with the sum of the items is arithmetic, and arithmetic belongs to the
    API's consistency pass in Rust (D30, AI-7)."""
    wrong = parse_receipt(fixture_json("receipt_wrong_total.json"))

    merged = merge(wrong, wrong)

    assert merged.total == Decimal("62000.00")


def test_a_merge_of_a_result_with_itself_changes_nothing() -> None:
    result = complete()
    assert merge(result, result) == result


def test_the_merged_result_is_at_least_as_good_as_either_half() -> None:
    """The property that makes pass 2 worth running at all."""
    from app.modules.extraction.scoring import calculate_quality_score

    first = replace(complete(), total=None, currency=None)
    second = replace(complete(), merchant=None, line_items=())

    merged = merge(first, second)

    assert calculate_quality_score(merged, today=TODAY) == 100
    assert calculate_quality_score(first, today=TODAY) == 45
    assert calculate_quality_score(second, today=TODAY) == 70


# ------------------------------------------------------------- statements


def test_a_statement_merge_keeps_the_page_that_read_better() -> None:
    poor = parse_statement(fixture_json("statement_poor.json"))
    clean = parse_statement(fixture_json("statement_clean.json"))

    assert merge_statements(poor, clean, today=TODAY) is clean
    assert merge_statements(clean, poor, today=TODAY) is clean


def test_a_statement_merge_counts_valid_rows_not_rows() -> None:
    """Four unusable rows are not a better reading than one usable one."""
    many = StatementResult(rows=tuple(StatementRow(description="?") for _ in range(4)))
    one = StatementResult(rows=(StatementRow(date="2026-11-02", amount=Decimal("1")),))

    assert merge_statements(many, one, today=TODAY) is one


def test_a_statement_merge_keeps_the_earlier_pass_on_a_tie() -> None:
    first = StatementResult(rows=(StatementRow(date="2026-11-02", amount=Decimal("1")),))
    second = StatementResult(rows=(StatementRow(date="2026-11-01", amount=Decimal("2")),))

    assert merge_statements(first, second, today=TODAY) is first


def test_a_line_item_carries_its_quantity_and_unit_price_through_a_merge() -> None:
    detailed = complete()
    bare = replace(
        complete(), line_items=(LineItem(name="Iga bakar", amount=Decimal("45000")),)
    )

    merged = merge(bare, detailed)

    assert merged.line_items[0].unit_price == Decimal("45000.00")
