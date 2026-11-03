"""CSV column mapping (D28, AI-9, US-022).

The cheapest and most reliable part of import. The model is shown the
column names and two sample rows, each cell clamped to 80 characters, and
it returns a mapping and nothing else
(docs/ai/service.md#csv-column-mapping).

What makes this reliable is what the model never touches. It does not see
the file, it does not see a row it is asked to convert, and it does not
produce an amount. Every row is then transformed by deterministic Rust, so
a decimal point cannot move and the cost is one small call whether the
file has ten rows or ten thousand. The old app asked the model to infer a
direction per row; mapping handles Indonesian statements' split debit and
credit columns once, as a mapping, with the sign rule in code.

Rule 4 is the one this route exists to get right. `Nama Pemilik`,
`Cardholder` and `Account Holder` name the user, not the other party, and
a mapping that puts them in `counterparty` labels every transaction in the
file with the importer's own name.

This runs one small call. It is not the quality ladder: there is nothing
to escalate to, because a mapping is either made of real column names or
it is discarded.
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

#: The fields a mapping may name, exactly as docs/ai/service.md lists
#: them, and matching `ColumnMapping` on the Rust side. A key outside this
#: set is dropped rather than relayed: the Rust importer reads a fixed
#: shape, and a model inventing a ninth field would become a silent no-op
#: there instead of a visible refusal here.
#:
#: The order matters, because it is the order rule 5 resolves a shared
#: column in: the first field to claim a column keeps it. `amount` sits
#: after the pair deliberately, so a model that answered with both shapes
#: against one column leaves the column with the shape that carries a
#: direction.
MAPPING_FIELDS = (
    "date",
    "name",
    "counterparty",
    "amount_out",
    "amount_in",
    "amount",
    "balance",
    "currency",
)

#: The two ways a statement states an amount, and they are alternatives.
#: `amount_out` / `amount_in` is the two-column shape most Indonesian
#: banks print; `amount` is one signed column, negative for money out.
#: Rust reads whichever shape it is handed, so a mapping carrying both
#: describes two different readings of the same file.
SPLIT_AMOUNT_FIELDS = ("amount_out", "amount_in")
SINGLE_AMOUNT_FIELD = "amount"

#: A mapping is a handful of short column names. Anything longer is the
#: model answering with something other than a mapping.
MAX_VALUE_CHARS = 120

#: Short on purpose: the answer is one small JSON object, and a ceiling on
#: it is a ceiling on how long an import waits before it starts.
MAX_OUTPUT_TOKENS = 512

SYSTEM_PROMPT = f"""\
You map a bank or card statement's column names onto a fixed set of
fields. You are given the column names and up to two sample rows. You
answer with one JSON object and nothing else.

{UNTRUSTED_INPUT}

Fields you may use, all optional:
- "date": the transaction date
- "name": the transaction text, memo or merchant line
- "counterparty": the other party to the transaction
- "amount_out": money leaving the account (debit)
- "amount_in": money arriving in the account (credit)
- "amount": one signed column holding both directions, negative for money
  leaving the account
- "balance": the running balance
- "currency": the currency

Rules:
1. Every value is a column name copied exactly from the input, character
   for character. Never invent one, never reword one, never correct a
   spelling.
2. Omit a field when no column matches it. An omitted field is better than
   a wrong one.
3. "name" is the transaction text, memo or merchant line.
4. "counterparty" is the OTHER party: the merchant, vendor, payee or
   recipient. Never a column naming the account holder. "Nama Pemilik",
   "Cardholder", "Account Holder", "Nama Nasabah" and "Account Name" are
   the user themselves, not the counterparty, so they map to nothing.
5. Never map two fields to the same column.
6. For "currency", return a column name if one exists. If none does but
   the sample rows make the currency plain, return the ISO 4217 code
   instead, for example "IDR".
7. A statement states its amounts in ONE of two shapes, and you return
   that one. Separate debit and credit columns are "amount_out" and
   "amount_in". A single column carrying both directions, where money
   leaving the account is written with a minus sign or in brackets, is
   "amount". NEVER return both shapes. A file with separate debit and
   credit columns gets "amount_out" and "amount_in" and no "amount"; a
   file with one signed column gets "amount" and neither of the others.
   "balance" is not an amount: a running balance is the state of the
   account, not a transaction, so map it to "balance" and never to an
   amount field.

Examples.

Input: {{"columns": ["Tanggal", "Keterangan", "Debet", "Kredit", "Saldo"],
"sample_rows": [{{"Tanggal": "02/11/2026", "Keterangan": "WARUNG TEKKO",
"Debet": "50.000", "Saldo": "1.200.000"}}]}}
Output: {{"date": "Tanggal", "name": "Keterangan", "amount_out": "Debet",
"amount_in": "Kredit", "balance": "Saldo"}}

Input: {{"columns": ["Date", "Description", "Amount", "Nama Pemilik"],
"sample_rows": [{{"Date": "2026-11-02", "Description": "GRAB RIDE",
"Amount": "-45000", "Nama Pemilik": "BUDI SANTOSO"}}]}}
Output: {{"date": "Date", "name": "Description", "amount": "Amount"}}

Input: {{"columns": ["Posting Date", "Details", "Merchant", "Debit (USD)",
"Credit"], "sample_rows": [{{"Posting Date": "11/02/2026", "Details":
"CARD PURCHASE 4821", "Merchant": "UBER", "Debit (USD)": "12.40"}}]}}
Output: {{"date": "Posting Date", "name": "Details", "counterparty":
"Merchant", "amount_out": "Debit (USD)", "amount_in": "Credit",
"currency": "USD"}}"""


class MappingFailed(Exception):
    """The model did not produce a usable mapping.

    Carries no text, for the same reason the extraction parser does not:
    the natural message would be the answer that failed, which is model
    output about somebody's bank statement (OPS-3).
    """


def build_user_message(columns: list[str], sample_rows: list[dict[str, str]]) -> str:
    """The input, as the model sees it: names and clamped sample cells.

    JSON rather than prose, because the answer is JSON and a matching
    shape on the way in is one fewer thing to misread.
    """
    return json.dumps(
        {"columns": columns, "sample_rows": sample_rows},
        ensure_ascii=False,
        separators=(",", ":"),
    )


def clean_mapping(body: dict[str, Any], columns: list[str]) -> dict[str, str]:
    """The mapping, with everything the model got wrong removed.

    Four things are dropped here, and each of them is a rule the model
    was given and sometimes breaks: a field this importer does not have,
    a value that is not one of the columns it was shown (rule 1), a
    column already used by an earlier field (rule 5), and `amount` when
    the split pair is also present (rule 7). `currency` is the one
    exception to the second, because rule 6 lets it be an ISO code rather
    than a column.

    Dropping beats relaying. A mapping naming a column that does not
    exist fails in the Rust importer as a column lookup against every row
    of the file.
    """
    known = set(columns)
    used: set[str] = set()
    mapping: dict[str, str] = {}

    for name in MAPPING_FIELDS:
        value = body.get(name)
        if not isinstance(value, str):
            continue
        value = value.strip()[:MAX_VALUE_CHARS]
        if not value:
            continue

        if value not in known:
            # Rule 6: a currency may be an inferred ISO 4217 code.
            if name == "currency" and len(value) == 3 and value.isalpha():
                mapping[name] = value.upper()
            continue
        if value in used:
            continue

        used.add(value)
        mapping[name] = value

    # Rule 7. The two shapes are alternatives, so a mapping carrying both
    # describes two different readings of the same file. The split pair
    # wins, because it states the direction in the layout rather than in
    # a sign the importer has to find: a row in the credit column is
    # money in whatever the figure looks like.
    if any(field in mapping for field in SPLIT_AMOUNT_FIELDS):
        mapping.pop(SINGLE_AMOUNT_FIELD, None)

    return mapping


async def map_columns(
    *, columns: list[str], sample_rows: list[dict[str, str]], config: Settings
) -> tuple[dict[str, str], str]:
    """One call. Returns the cleaned mapping and the model that made it.

    `tools=[]`, like every other call in this package: the column names
    and sample cells came out of a file somebody uploaded, so the
    component reading them has nothing to call (D24, SEC-21).

    `AI_CHAT_MODEL` rather than one of the vision ids, because nothing
    here is an image. It is a short reasoning task over a handful of
    strings, and it runs once per file.
    """
    message = await model.complete(
        model=config.ai_chat_model,
        max_tokens=MAX_OUTPUT_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_user_message(columns, sample_rows)}],
        tools=[],
    )

    try:
        body = load_object(answer_text(message))
    except AnswerUnparsable as error:
        logger.info("column mapping answered outside the agreed shape")
        raise MappingFailed from error

    mapping = clean_mapping(body, columns)
    # Field names only. A column name is the user's own file's content.
    logger.info("column mapping produced %d of %d fields", len(mapping), len(MAPPING_FIELDS))
    return mapping, config.ai_chat_model


__all__ = [
    "MAPPING_FIELDS",
    "SINGLE_AMOUNT_FIELD",
    "SPLIT_AMOUNT_FIELDS",
    "MAX_OUTPUT_TOKENS",
    "MappingFailed",
    "SYSTEM_PROMPT",
    "build_user_message",
    "clean_mapping",
    "map_columns",
]
