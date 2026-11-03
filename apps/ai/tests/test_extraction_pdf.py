"""The deterministic PDF path and the answer parser (D42, D12).

Two things that never call a model at all. The PDF text layer is the
cheapest pass in the ladder, and the parser is the line that keeps a float
out of a receipt total.

The PDF fixtures are hand-built one-page documents with a real text layer,
generated once and committed. They are not photographs of receipts: what
is being tested is whether the text layer is read and parsed, not whether
a model can see.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.modules.extraction.parsing import (
    AnswerUnparsable,
    load_object,
    parse_receipt,
    parse_statement,
)
from app.modules.extraction.pdf_text import (
    find_currency,
    find_date,
    parse_receipt_text,
    parse_statement_text,
    pdf_text,
)
from app.modules.extraction.results import parse_money
from app.modules.extraction.scoring import calculate_quality_score
from tests.extraction_support import fixture_bytes

TODAY = date(2026, 11, 3)


# ----------------------------------------------------------- the text layer


def test_a_pdf_with_a_text_layer_yields_its_own_characters() -> None:
    text = pdf_text(fixture_bytes("receipt_text_layer.pdf"))

    assert text is not None
    assert "Warung Tekko" in text
    assert "TOTAL 87500" in text


def test_a_pdf_without_a_text_layer_yields_nothing() -> None:
    assert pdf_text(fixture_bytes("scan_no_text_layer.pdf")) is None


def test_bytes_that_are_not_a_pdf_yield_nothing_rather_than_raising() -> None:
    """A file this service cannot open is a document the ladder escalates
    on, not a request that failed."""
    assert pdf_text(b"not a pdf at all") is None
    assert pdf_text(b"") is None


def test_a_text_layer_receipt_parses_well_enough_to_skip_the_model() -> None:
    text = pdf_text(fixture_bytes("receipt_text_layer.pdf"))
    assert text is not None

    result = parse_receipt_text(text)

    assert result.merchant == "Warung Tekko"
    assert result.date == "2026-11-02"
    assert result.total == Decimal("87500")
    assert result.subtotal == Decimal("80000")
    assert result.tax == Decimal("7500")
    assert result.currency == "IDR"
    assert [item.name for item in result.line_items] == [
        "Iga bakar",
        "Nasi putih",
        "Es teh manis",
    ]
    assert calculate_quality_score(result, today=TODAY) == 100


def test_the_date_line_does_not_become_a_line_item() -> None:
    """`2026-11-02` ends in digits, so the trailing-amount rule reads
    `02` as an amount unless a name has to contain a letter."""
    result = parse_receipt_text("Warung Tekko\n2026-11-02\nIga bakar 45000\nTOTAL 45000")

    assert [item.name for item in result.line_items] == ["Iga bakar"]


def test_a_total_line_is_not_a_line_item() -> None:
    result = parse_receipt_text("Toko\nIga bakar 45000\nSubtotal 45000\nTax 4500\nTOTAL 49500")

    assert [item.name for item in result.line_items] == ["Iga bakar"]
    assert result.total == Decimal("49500")


def test_a_text_layer_statement_parses_its_rows() -> None:
    text = pdf_text(fixture_bytes("statement_text_layer.pdf"))
    assert text is not None

    result = parse_statement_text(text)

    assert len(result.rows) == 3
    assert result.rows[0].date == "2026-11-02"
    assert result.rows[0].amount == Decimal("87500")
    assert calculate_quality_score(result, today=TODAY) == 100


# --------------------------------------------------------------- the dates


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("tanggal 2026-11-02", "2026-11-02"),
        ("28/10/2026", "2026-10-28"),
        ("28-10-2026", "2026-10-28"),
        ("2 November 2026", "2026-11-02"),
        ("2 Nov 2026", "2026-11-02"),
        ("28 Oktober 2026", "2026-10-28"),
    ],
)
def test_an_unambiguous_date_is_read(text: str, expected: str) -> None:
    assert find_date(text) == expected


@pytest.mark.parametrize("text", ["03/04/2026", "11/02/2026", "nothing here", "32/13/2026"])
def test_an_ambiguous_or_impossible_date_is_left_absent(text: str) -> None:
    """This process cannot tell March from April, and a wrong date that
    looks right is worse than no date: the absence is flagged for the
    user, the wrong one is tapped past (AI-11)."""
    assert find_date(text) is None


@pytest.mark.parametrize(
    ("text", "expected"),
    [("Total IDR 87500", "IDR"), ("Rp 87.500", "IDR"), ("$ 12.40", "USD"), ("87500", None)],
)
def test_the_currency_comes_from_a_code_or_a_symbol(text: str, expected: str | None) -> None:
    assert find_currency(text) == expected


# -------------------------------------------------------------- the money


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("87500.00", Decimal("87500.00")),
        ("87500", Decimal("87500")),
        ("Rp 87500.00", Decimal("87500.00")),
        ("-45000", Decimal("-45000")),
        (Decimal("1.5"), Decimal("1.5")),
    ],
)
def test_a_plain_decimal_is_read(raw: object, expected: Decimal) -> None:
    assert parse_money(raw) == expected


@pytest.mark.parametrize(
    "raw",
    ["87.500", "87,500.00", "87.500,00", "about 87 thousand", "", "1e9", None, True, 87500.0],
)
def test_anything_ambiguous_is_refused_rather_than_guessed(raw: object) -> None:
    """`87.500` is 87,500 in Jakarta and 87.5 in Chicago, and nothing in
    this process can tell which. A separator read the wrong way moves a
    total by three orders of magnitude (D12)."""
    assert parse_money(raw) is None


def test_an_absurd_amount_is_refused() -> None:
    assert parse_money("1" + "0" * 20) is None


# ------------------------------------------------------- the answer parser


def test_a_number_the_model_wrote_unquoted_is_still_not_a_float() -> None:
    """The single most important line in the parser. Without
    `parse_float=Decimal` the amount has been through a binary double
    before any of this code sees it, and the damage is invisible
    afterwards (D12).
    """
    result = parse_receipt(load_object('{"total": 87500.10, "currency": "IDR"}'))

    assert isinstance(result.total, Decimal)
    assert str(result.total) == "87500.10"


def test_a_code_fence_is_tolerated() -> None:
    """The prompts ask for none. Stripping one costs nothing; a whole
    extra model pass costs 20 seconds of a user's attention."""
    body = load_object('```json\n{"total": "100.00"}\n```')

    assert body["total"] == "100.00"


def test_prose_around_the_object_is_tolerated() -> None:
    body = load_object('Here is the receipt:\n{"total": "100.00"}\nHope that helps.')

    assert body["total"] == "100.00"


@pytest.mark.parametrize("text", ["not json at all", "", "[1, 2, 3]", "{ broken"])
def test_an_answer_that_is_not_an_object_raises(text: str) -> None:
    with pytest.raises(AnswerUnparsable):
        load_object(text)


def test_an_unparsable_failure_carries_no_text() -> None:
    """Its natural message would be the thing that failed to parse, which
    is model output about somebody's receipt (OPS-3)."""
    try:
        load_object("Warung Tekko, total 87500")
    except AnswerUnparsable as error:
        assert "Warung Tekko" not in str(error)
        assert "87500" not in str(error)


def test_a_total_the_model_wrote_as_prose_is_marked_not_dropped() -> None:
    """Present but unusable scores differently to missing, and it is what
    gives the targeted pass something to re-ask for."""
    result = parse_receipt({"total": "about 87 thousand"})

    assert result.total is None
    assert "total" in result.unreadable


def test_a_line_item_with_neither_a_name_nor_an_amount_is_dropped() -> None:
    result = parse_receipt(
        {"line_items": [{"name": "Iga bakar"}, {"amount": "1.00"}, {}, "not an object"]}
    )

    assert len(result.line_items) == 2


def test_a_negative_statement_amount_becomes_a_positive_expense() -> None:
    """The sign is the column the figure came from, not a negative
    purchase."""
    result = parse_statement({"rows": [{"date": "2026-11-02", "amount": "-45000"}]})

    assert result.rows[0].amount == Decimal("45000")
    assert result.rows[0].direction == "expense"


def test_a_direction_the_model_invented_is_dropped() -> None:
    result = parse_statement(
        {"rows": [{"date": "2026-11-02", "amount": "100", "direction": "sideways"}]}
    )

    assert result.rows[0].direction is None


def test_rows_that_are_not_objects_are_skipped() -> None:
    result = parse_statement({"rows": ["2026-11-02 WARUNG TEKKO 87500", 3, None]})

    assert result.rows == ()
