"""What the three extraction routes accept and answer.

The API is the only caller and every body travels under OWE1 (D22), so
these models are a contract between two services rather than a public API.
They are still validated strictly: an unsupported media type is a refusal
with a reason, not a 500 three layers down when the provider rejects the
block.

**Every money figure leaves as a string** (D12). `Decimal` in Python, a
string on the wire, never a JSON number: a `float` here would be a
rounding error in a ledger, and `87500.0000` written as a number is a
double by the time the API's parser sees it.

`corrected_fields` is always present and always empty from this service.
Cross-field consistency, which is the thing that corrects a figure, is the
API's pure Rust pass (D30, AI-7). The key is in the response shape because
the API fills it in before the user sees the draft, and this service
answering with anything else in it would mean two layers were correcting
the same number.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.modules.extraction.results import (
    ExtractionResult,
    ReceiptResult,
    StatementResult,
    format_money,
    format_quantity,
    valid_currency,
    valid_date,
)

#: What the model can be shown. Anything else is refused on the way in
#: rather than sent to a provider that will refuse it less clearly.
MediaType = Literal["image/jpeg", "image/png", "image/webp", "application/pdf"]

#: A ceiling on the encoded document, before base64's own overhead: about
#: 15 MB of file. Larger than any receipt and larger than any statement
#: page, and a bound the provider would otherwise impose less politely.
MAX_DOCUMENT_CHARS = 20_000_000


class Document(BaseModel):
    media_type: MediaType
    #: Base64, as the API read it out of the vault. Passed to the provider
    #: unchanged rather than decoded and re-encoded.
    data: str = Field(min_length=1, max_length=MAX_DOCUMENT_CHARS)


class ExtractionRequest(BaseModel):
    """The body both document routes take.

    `today` and `workspace_currency` arrive from the API because this
    service reads no database (D3) and has no workspace timezone to derive
    a date from. `today` is what a date is judged believable against.
    """

    request_id: str = Field(min_length=1, max_length=64)
    workspace_id: str = Field(min_length=1, max_length=64)
    document: Document
    workspace_currency: str = Field(min_length=3, max_length=3)
    today: date

    @field_validator("workspace_currency")
    @classmethod
    def _iso_4217(cls, value: str) -> str:
        code = valid_currency(value)
        if code is None:
            raise ValueError("workspace_currency must be an ISO 4217 code")
        return code


class Quality(BaseModel):
    score: int
    low_confidence_fields: list[str] = Field(default_factory=list)
    #: Always empty from this service. See the module docstring.
    corrected_fields: list[str] = Field(default_factory=list)


def _line_item(item: object) -> dict[str, str]:
    body: dict[str, str] = {}
    name = getattr(item, "name", None)
    if name:
        body["name"] = name
    amount = getattr(item, "amount", None)
    if amount is not None:
        body["amount"] = format_money(amount)
    quantity = getattr(item, "quantity", None)
    if quantity is not None:
        body["quantity"] = format_quantity(quantity)
    unit_price = getattr(item, "unit_price", None)
    if unit_price is not None:
        body["unit_price"] = format_money(unit_price)
    return body


def receipt_draft(result: ReceiptResult, *, today: date) -> dict[str, object]:
    """The draft, as the confirmation sheet reads it.

    A field this service is not sure of is left out rather than sent as
    something plausible: a date that did not validate is absent here and
    named in `low_confidence_fields`, so the sheet asks for it instead of
    showing a wrong one the user taps past (AI-11).
    """
    draft: dict[str, object] = {}

    if result.merchant:
        draft["merchant"] = result.merchant

    when = valid_date(result.date, today)
    if when is not None:
        draft["date"] = when.isoformat()

    for name in ("total", "subtotal", "tax"):
        value = getattr(result, name)
        if value is not None:
            draft[name] = format_money(value)

    currency = valid_currency(result.currency)
    if currency is not None:
        draft["currency"] = currency

    items = [_line_item(item) for item in result.line_items]
    draft["line_items"] = [item for item in items if item]
    return draft


def statement_rows(result: StatementResult, *, today: date) -> list[dict[str, str]]:
    """Every row that carries a date and an amount.

    A row missing either is dropped rather than returned half-made: the
    API would have to discard it anyway, and the score has already counted
    it against the page.
    """
    rows = []
    for row in result.rows:
        when = valid_date(row.date, today)
        if when is None or row.amount is None:
            continue
        body = {"date": when.isoformat(), "amount": format_money(row.amount)}
        if row.description:
            body["description"] = row.description
        if row.direction:
            body["direction"] = row.direction
        rows.append(body)
    return rows


def extraction_payload(
    *,
    kind: str,
    result: ExtractionResult,
    score: int,
    low_confidence: list[str],
    passes: int,
    models: list[str],
    today: date,
) -> dict[str, object]:
    """The body of either route, assembled in one place.

    Both shapes carry `quality`, `passes` and `models`, and differ only in
    whether the content is a draft or a list of rows.
    """
    quality = Quality(score=score, low_confidence_fields=low_confidence)
    body: dict[str, object] = {
        "quality": quality.model_dump(),
        "passes": passes,
        "models": models,
    }
    if kind == "receipt":
        assert isinstance(result, ReceiptResult)
        body["draft"] = receipt_draft(result, today=today)
    else:
        assert isinstance(result, StatementResult)
        body["rows"] = statement_rows(result, today=today)
    return body


# ------------------------------------------------------- column mapping


#: Each cell is clamped to this before the model sees it (D28). A sample
#: row exists to show the shape of a column's values, and 80 characters is
#: more than enough to recognise a date, an amount or a merchant name.
MAX_CELL_CHARS = 80

#: Two rows, as the doc specifies. The model is choosing between column
#: names; a third row adds cost and tells it nothing new.
MAX_SAMPLE_ROWS = 2

MAX_COLUMNS = 60
MAX_COLUMN_NAME_CHARS = 120


class ColumnMappingRequest(BaseModel):
    """Column names and at most two sample rows (D28, AI-9).

    This is the cheapest and most reliable part of import, and the reason
    is what is **not** in this body: no file, no row count, and no amount
    the model could move a decimal point in. It sees the headers and a
    sample of what they contain, and answers with a mapping. Every row is
    then transformed by deterministic Rust, so the cost is one small call
    whether the file has ten rows or ten thousand.
    """

    request_id: str = Field(min_length=1, max_length=64)
    workspace_id: str = Field(min_length=1, max_length=64)
    columns: list[str] = Field(min_length=1, max_length=MAX_COLUMNS)
    sample_rows: list[dict[str, str]] = Field(
        default_factory=list, max_length=MAX_SAMPLE_ROWS * 4
    )

    @field_validator("columns")
    @classmethod
    def _clamp_names(cls, value: list[str]) -> list[str]:
        return [name.strip()[:MAX_COLUMN_NAME_CHARS] for name in value]

    def clamped_rows(self) -> list[dict[str, str]]:
        """At most two rows, each cell clamped to 80 characters.

        Clamping here rather than in the prompt builder, so the bound is
        on the data and not on one way of formatting it: a second caller
        of this model cannot forget it.
        """
        rows = []
        for row in self.sample_rows[:MAX_SAMPLE_ROWS]:
            rows.append({key: str(cell)[:MAX_CELL_CHARS] for key, cell in row.items()})
        return rows


#: Bounds on a categorize request. A receipt with more than this many
#: lines is categorised by its first ones; a workspace with more than this
#: many expense categories is not a list a model picks from well anyway.
MAX_CATEGORIZE_ITEMS = 40
MAX_CATEGORIES = 60
MAX_LABEL_CHARS = 120


class CategorizeRequest(BaseModel):
    """What a saved receipt was, and what it could be filed under (D86).

    Strings only: the API sends what extraction already read, never the
    document, so this route cannot be used to read an image again.
    """

    request_id: str = Field(min_length=1, max_length=64)
    workspace_id: str = Field(min_length=1, max_length=64)
    merchant: str | None = Field(default=None, max_length=MAX_LABEL_CHARS)
    items: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list, max_length=MAX_CATEGORIES)

    @field_validator("items")
    @classmethod
    def _clamp_items(cls, value: list[str]) -> list[str]:
        return [item.strip()[:MAX_LABEL_CHARS] for item in value[:MAX_CATEGORIZE_ITEMS]]

    @field_validator("categories")
    @classmethod
    def _clamp_categories(cls, value: list[str]) -> list[str]:
        return [name.strip()[:MAX_LABEL_CHARS] for name in value if name.strip()]


__all__ = [
    "CategorizeRequest",
    "ColumnMappingRequest",
    "Document",
    "ExtractionRequest",
    "MAX_CELL_CHARS",
    "MAX_SAMPLE_ROWS",
    "MediaType",
    "Quality",
    "extraction_payload",
    "receipt_draft",
    "statement_rows",
]
