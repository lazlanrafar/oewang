"""The deterministic path: a PDF that carries its own text (D42).

A PDF produced by a point-of-sale system or a bank carries the characters,
not a picture of them. Reading them is free, exact and instant, and asking
a vision model to look at a rendering of text it could have been handed is
the most expensive way to get a worse answer. So the text layer is tried
first, and the ladder's model passes run only when it yields nothing
usable.

The parser here is deliberately narrow, and the narrowness is the point:

- **Dates.** ISO, an unambiguous numeric date where the day is above 12,
  and a spelled month in English or Indonesian. `03/04/2026` is left
  absent, because this process cannot tell March from April and a wrong
  date that looks right is worse than no date (AI-11 flags the absence).
- **Amounts.** A trailing figure on a line, with grouping separators
  resolved only when the separator pattern is unambiguous.
- **Everything else** is left to the model. This parser never produces a
  partial answer it is not sure of; it produces a good answer or it
  produces nothing and the ladder escalates.

What comes out is scored by exactly the same function as a model pass, so
"usable" means one thing in this service (`AI_QUALITY_THRESHOLD`) rather
than two.
"""

from __future__ import annotations

import io
import logging
import re
from datetime import date
from decimal import Decimal, InvalidOperation

from pypdf import PdfReader
from pypdf.errors import PyPdfError

from app.modules.extraction.results import (
    LineItem,
    ReceiptResult,
    StatementResult,
    StatementRow,
    blank_to_none,
)

logger = logging.getLogger("oewang.ai.extraction")

#: Fewer characters than this is not a text layer, it is the handful of
#: stray glyphs a scanner embeds beside the image.
MIN_USABLE_CHARS = 40

#: A ceiling on what is read out of one document, so a pathological PDF
#: cannot turn into an unbounded parse.
MAX_TEXT_CHARS = 200_000
MAX_PAGES = 50

_MONTHS = {
    "jan": 1, "january": 1, "januari": 1,
    "feb": 2, "february": 2, "februari": 2,
    "mar": 3, "march": 3, "maret": 3,
    "apr": 4, "april": 4,
    "may": 5, "mei": 5,
    "jun": 6, "june": 6, "juni": 6,
    "jul": 7, "july": 7, "juli": 7,
    "aug": 8, "august": 8, "agu": 8, "agustus": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "okt": 10, "oktober": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12, "des": 12, "desember": 12,
}  # fmt: skip

_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_NUMERIC = re.compile(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b")
_SPELLED = re.compile(r"\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b")

#: A figure at the end of a line, which is where every receipt and every
#: statement puts one.
_TRAILING_AMOUNT = re.compile(r"([0-9][0-9.,  ]*[0-9]|[0-9])\s*$")

#: Grouping separators, resolved only where the pattern leaves no doubt.
_GROUPED_DOT = re.compile(r"^\d{1,3}(?:\.\d{3})+$")
_GROUPED_COMMA = re.compile(r"^\d{1,3}(?:,\d{3})+$")
_DOT_DECIMAL = re.compile(r"^\d{1,3}(?:,\d{3})*\.\d{1,4}$")
_COMMA_DECIMAL = re.compile(r"^\d{1,3}(?:\.\d{3})*,\d{1,2}$")
_PLAIN = re.compile(r"^\d+$")

_TOTAL_LABEL = re.compile(r"\b(grand\s+total|total\s+bayar|total|jumlah|amount\s+due)\b", re.I)
_SUBTOTAL_LABEL = re.compile(r"\b(sub\s*-?\s*total|subtotal)\b", re.I)
_TAX_LABEL = re.compile(r"\b(tax|vat|ppn|pb1|service|pajak)\b", re.I)

#: Lines that are never a line item, however they are shaped.
_NOT_AN_ITEM = re.compile(
    r"\b(total|subtotal|sub-total|jumlah|tax|vat|ppn|pb1|pajak|service|change|kembali|"
    r"tunai|cash|card|kartu|balance|saldo|invoice|receipt|struk|npwp|terima\s+kasih|"
    r"thank\s+you|brought\s+forward|carried\s+forward)\b",
    re.I,
)

#: An item has a name, and a name has a letter in it. Without this the
#: date line of a receipt becomes an item: `2026-11-02` ends in digits, so
#: the trailing-amount rule reads `02` as an amount and `2026-11` as what
#: it was bought for.
_HAS_LETTER = re.compile(r"[^\W\d_]")

_CURRENCY_CODE = re.compile(r"\b(IDR|USD|EUR|SGD|AUD|MYR|GBP|JPY|THB|PHP|VND|CNY)\b")
_CURRENCY_SYMBOL = (
    ("Rp", "IDR"),
    ("$", "USD"),
    ("€", "EUR"),
    ("£", "GBP"),
    ("¥", "JPY"),
)


def pdf_text(data: bytes) -> str | None:
    """The document's own text, or `None` when it carries none worth
    reading.

    Never raises: a PDF this service cannot open is a document the ladder
    escalates on, not a request that failed. Only the exception type is
    logged, because a parser error message quotes the file (OPS-3).
    """
    try:
        reader = PdfReader(io.BytesIO(data))
        pages = reader.pages[:MAX_PAGES]
        text = "\n".join(page.extract_text() or "" for page in pages)
    except (PyPdfError, ValueError, OSError, RecursionError) as error:
        logger.info("the PDF text layer could not be read: %s", type(error).__name__)
        return None

    text = text[:MAX_TEXT_CHARS]
    return text if len(text.strip()) >= MIN_USABLE_CHARS else None


# ------------------------------------------------------------------ pieces


def _amount(raw: str) -> Decimal | None:
    """A figure from a statement or receipt line, or `None`.

    Every branch here is a separator pattern that can only be read one
    way. `1.234` is not one of them: three digits after a dot is a
    thousands group in Jakarta and a fraction nowhere, but `1.23` is a
    fraction everywhere, so only the unambiguous shapes are read.
    """
    text = raw.replace(" ", "").replace(" ", "")
    if not text:
        return None

    if _PLAIN.match(text):
        cleaned = text
    elif _GROUPED_DOT.match(text):
        cleaned = text.replace(".", "")
    elif _GROUPED_COMMA.match(text) or _DOT_DECIMAL.match(text):
        # `1,234` and `1,234.50`: the comma groups and the dot, if there
        # is one, is the decimal point.
        cleaned = text.replace(",", "")
    elif _COMMA_DECIMAL.match(text):
        cleaned = text.replace(".", "").replace(",", ".")
    else:
        return None

    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _trailing_amount(line: str) -> Decimal | None:
    match = _TRAILING_AMOUNT.search(line)
    return _amount(match[1]) if match else None


def find_date(text: str) -> str | None:
    """The first date in the text, as ISO, or `None`.

    An ambiguous numeric date is no date. This is the rule that keeps the
    deterministic path honest: it would be easy to assume day-first here
    and be wrong eleven times a year, in a field nobody re-checks.
    """
    iso = _ISO.search(text)
    if iso:
        return _iso_or_none(int(iso[1]), int(iso[2]), int(iso[3]))

    spelled = _SPELLED.search(text)
    if spelled:
        month = _MONTHS.get(spelled[2].lower())
        if month:
            return _iso_or_none(int(spelled[3]), month, int(spelled[1]))

    for match in _NUMERIC.finditer(text):
        first, second = int(match[1]), int(match[2])
        if first > 12 and second <= 12:
            return _iso_or_none(int(match[3]), second, first)
        if second > 12 and first <= 12:
            return _iso_or_none(int(match[3]), first, second)
    return None


def _iso_or_none(year: int, month: int, day: int) -> str | None:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def find_currency(text: str) -> str | None:
    code = _CURRENCY_CODE.search(text)
    if code:
        return code[1]
    for symbol, mapped in _CURRENCY_SYMBOL:
        if symbol in text:
            return mapped
    return None


def _labelled_amount(lines: list[str], label: re.Pattern[str]) -> Decimal | None:
    """The last figure on a line carrying `label`.

    The last, not the first: a receipt prints `TOTAL` once at the bottom
    and sometimes once in a header, and the bottom one is the one the
    customer paid.
    """
    for line in reversed(lines):
        if label.search(line):
            value = _trailing_amount(line)
            if value is not None:
                return value
    return None


# ----------------------------------------------------------------- parsers


def parse_receipt_text(text: str) -> ReceiptResult:
    """A receipt from a PDF's own characters.

    Scored by the same function as a model pass, so a thin reading simply
    scores low and the ladder escalates past it.
    """
    lines = [" ".join(line.split()) for line in text.splitlines()]
    lines = [line for line in lines if line]

    total = _labelled_amount(lines, _TOTAL_LABEL)
    subtotal = _labelled_amount(lines, _SUBTOTAL_LABEL)
    tax = _labelled_amount(lines, _TAX_LABEL)

    # The subtotal label matches the total label's "total" too, so a line
    # read as both is the subtotal and nothing else.
    if total is not None and subtotal is not None and total == subtotal:
        subtotal = None

    items = []
    for line in lines:
        if _NOT_AN_ITEM.search(line):
            continue
        amount = _trailing_amount(line)
        if amount is None:
            continue
        name = blank_to_none(_TRAILING_AMOUNT.sub("", line).strip(" .-:x*"), limit=200)
        if name is None or not _HAS_LETTER.search(name):
            continue
        items.append(LineItem(name=name, amount=amount))

    return ReceiptResult(
        # The first line of a receipt is its name, on paper and in PDFs.
        merchant=blank_to_none(lines[0] if lines else None, limit=200),
        date=find_date(text),
        total=total,
        subtotal=subtotal,
        tax=tax,
        currency=find_currency(text),
        line_items=tuple(items),
    )


def parse_statement_text(text: str) -> StatementResult:
    """Statement rows from a PDF's own characters.

    One row per line that carries both a date and a trailing figure.
    Direction is left absent: a single-column statement does not say, and
    this parser does not infer.
    """
    rows = []
    for raw in text.splitlines():
        line = " ".join(raw.split())
        if not line or _NOT_AN_ITEM.search(line):
            continue
        when = find_date(line)
        amount = _trailing_amount(line)
        if when is None or amount is None:
            continue
        # The printed date stays in the description: it is written in the
        # statement's own format, not in `when`'s, and cutting a substring
        # this parser only inferred would take the wrong characters out.
        description = blank_to_none(_TRAILING_AMOUNT.sub("", line).strip(" .-:|"), limit=500)
        rows.append(StatementRow(date=when, description=description, amount=abs(amount)))
    return StatementResult(rows=tuple(rows))


__all__ = [
    "MIN_USABLE_CHARS",
    "find_currency",
    "find_date",
    "parse_receipt_text",
    "parse_statement_text",
    "pdf_text",
]
