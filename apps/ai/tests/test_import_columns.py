"""`POST /import/map-columns` (D28, AI-9, US-022).

The cheapest and most reliable part of import, and these tests are about
what the model is **not** given. It sees the column names and two sample
rows with every cell clamped to 80 characters. It never sees a row it is
asked to convert, it never produces an amount, and it has no tools.

Rule 4 gets a test of its own with an Indonesian statement's headers,
because it is the mistake this route exists to prevent: `Nama Pemilik` is
the account holder, and a mapping that puts them in `counterparty` labels
every transaction in the file with the importer's own name.
"""

from __future__ import annotations

import json
from typing import Any

from app.core import model
from app.modules.extraction.columns import MAPPING_FIELDS, SYSTEM_PROMPT, clean_mapping
from app.modules.extraction.schemas import MAX_CELL_CHARS, MAX_SAMPLE_ROWS
from tests.extraction_support import Answer, ScriptedClient, assert_no_tools
from tests.support import Owe1TestClient

INDONESIAN = ["Tanggal", "Keterangan", "Debet", "Kredit", "Saldo"]


def payload(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "request_id": "01JC0TESTREQUEST",
        "workspace_id": "clxworkspace1",
        "columns": INDONESIAN,
        "sample_rows": [
            {
                "Tanggal": "02/11/2026",
                "Keterangan": "WARUNG TEKKO",
                "Debet": "50.000",
                "Saldo": "1.200.000",
            }
        ],
    }
    body.update(overrides)
    return body


def mapping_answer(**mapping: str) -> Answer:
    return Answer(text=json.dumps(mapping))


def call(client: Owe1TestClient, **overrides: Any) -> dict:
    return client.call("POST", "/import/map-columns", body=payload(**overrides))


# ------------------------------------------------------------ the mapping


def test_an_indonesian_statement_maps_its_split_columns(
    owe1_client: Owe1TestClient,
) -> None:
    """Debit and credit in two columns, handled once as a mapping rather
    than per row. The sign rule lives in Rust."""
    scripted = ScriptedClient(
        mapping_answer(
            date="Tanggal",
            name="Keterangan",
            amount_out="Debet",
            amount_in="Kredit",
            balance="Saldo",
        )
    )
    model.set_model_client(scripted)

    body = call(owe1_client)

    assert body["data"]["mapping"] == {
        "date": "Tanggal",
        "name": "Keterangan",
        "amount_out": "Debet",
        "amount_in": "Kredit",
        "balance": "Saldo",
    }
    assert_no_tools(scripted)


def test_the_call_passes_no_tools(owe1_client: Owe1TestClient) -> None:
    """The column names and the sample cells came out of a file somebody
    uploaded, so the component reading them has nothing to call
    (D24, SEC-21)."""
    scripted = ScriptedClient(mapping_answer(date="Tanggal"))
    model.set_model_client(scripted)

    call(owe1_client)

    assert scripted.calls[0]["tools"] == []
    assert len(scripted.calls) == 1, "one small call per file, not one per row"


# -------------------------------------------------------------- the clamp


def test_every_sample_cell_is_clamped_to_eighty_characters(
    owe1_client: Owe1TestClient,
) -> None:
    scripted = ScriptedClient(mapping_answer(date="Tanggal"))
    model.set_model_client(scripted)
    long_cell = "WARUNG TEKKO " * 40

    call(
        owe1_client,
        sample_rows=[{"Tanggal": "02/11/2026", "Keterangan": long_cell}],
    )

    sent = scripted.calls[0]["messages"][0]["content"]
    cells = json.loads(sent)["sample_rows"][0]

    assert len(cells["Keterangan"]) == MAX_CELL_CHARS
    assert long_cell not in sent


def test_only_two_sample_rows_reach_the_model(owe1_client: Owe1TestClient) -> None:
    """A third row costs tokens and tells the model nothing new: it is
    choosing between column names, not reading data."""
    scripted = ScriptedClient(mapping_answer(date="Tanggal"))
    model.set_model_client(scripted)

    call(
        owe1_client,
        sample_rows=[{"Tanggal": f"0{index}/11/2026"} for index in range(1, 5)],
    )

    sent = json.loads(scripted.calls[0]["messages"][0]["content"])

    assert len(sent["sample_rows"]) == MAX_SAMPLE_ROWS


def test_the_model_is_shown_the_column_names(owe1_client: Owe1TestClient) -> None:
    scripted = ScriptedClient(mapping_answer(date="Tanggal"))
    model.set_model_client(scripted)

    call(owe1_client)

    sent = json.loads(scripted.calls[0]["messages"][0]["content"])

    assert sent["columns"] == INDONESIAN


# ------------------------------------------------------------- rule 4


def test_the_account_holder_is_never_the_counterparty() -> None:
    """Rule 4, which is the whole reason this route is prompted rather
    than guessed at with a lookup table.

    `Nama Pemilik` is the person importing the file. A mapping that puts
    them in `counterparty` labels every transaction in the statement with
    the importer's own name, and nothing downstream can tell that it is
    wrong, because it is a real column with real values in it.
    """
    columns = ["Tanggal", "Keterangan", "Nominal", "Nama Pemilik"]
    answered = {
        "date": "Tanggal",
        "name": "Keterangan",
        "amount_out": "Nominal",
        # What the prompt tells the model not to do, cleaned here as well
        # only insofar as it is a duplicate; the real defence is the rule
        # and the few-shot example, and this test is what notices if the
        # prompt stops carrying them.
        "counterparty": "Nama Pemilik",
    }

    cleaned = clean_mapping(answered, columns)

    assert cleaned["name"] == "Keterangan"
    assert cleaned["amount_out"] == "Nominal"
    # The cleaner cannot know this one is wrong, so it stays. The prompt
    # is what keeps it from being answered in the first place.
    assert cleaned["counterparty"] == "Nama Pemilik"


def test_the_prompt_names_the_account_holder_columns() -> None:
    """The defence itself, asserted where it lives. Dropping these names
    from the prompt is the change this test exists to catch."""
    for header in ("Nama Pemilik", "Cardholder", "Account Holder"):
        assert header in SYSTEM_PROMPT
    assert "Never a column naming the account holder" in SYSTEM_PROMPT


# ------------------------------------------------------------- rule 7


def test_a_single_signed_amount_column_has_somewhere_to_go(
    owe1_client: Owe1TestClient,
) -> None:
    """The shape a two-column mapping cannot describe.

    A statement with one signed column, negative for money out, is a
    whole class of files, and before `amount` existed the wizard's second
    step came back empty for every one of them. Rust's `read_amount`
    already reads this shape: negative is an expense, positive is income.
    """
    columns = ["Date", "Description", "Amount"]
    model.set_model_client(
        ScriptedClient(mapping_answer(date="Date", name="Description", amount="Amount"))
    )

    body = call(owe1_client, columns=columns, sample_rows=[{"Amount": "-45000"}])

    assert body["data"]["mapping"]["amount"] == "Amount"


def test_the_two_amount_shapes_are_alternatives_never_both() -> None:
    """The split pair wins.

    It states the direction in the layout rather than in a sign the
    importer has to find: a figure in the credit column is money in
    whatever it looks like. A mapping carrying both shapes describes two
    different readings of one file, and Rust would have to pick one
    without knowing which the model meant.
    """
    columns = ["Tanggal", "Debet", "Kredit", "Nominal"]
    answered = {
        "date": "Tanggal",
        "amount_out": "Debet",
        "amount_in": "Kredit",
        "amount": "Nominal",
    }

    cleaned = clean_mapping(answered, columns)

    assert cleaned == {"date": "Tanggal", "amount_out": "Debet", "amount_in": "Kredit"}


def test_one_half_of_the_split_pair_is_still_the_split_shape() -> None:
    """A debit column with no credit column is the two-column shape with
    one column, not an invitation to add a signed one as well."""
    cleaned = clean_mapping(
        {"amount_out": "Debet", "amount": "Nominal"}, ["Debet", "Nominal"]
    )

    assert cleaned == {"amount_out": "Debet"}


def test_the_prompt_tells_the_model_to_pick_one_amount_shape() -> None:
    """Rule 7 asserted where the defence lives. The cleaner can only drop
    a second shape after the fact; the prompt is what stops the model
    producing one."""
    assert "NEVER return both shapes" in SYSTEM_PROMPT
    assert '"amount": one signed column' in SYSTEM_PROMPT


def test_the_prompt_keeps_somewhere_to_put_the_balance_column() -> None:
    """Rust ignores `balance`, and it stays in the catalog anyway: a
    model with nowhere to put a running balance tries to map it to an
    amount, which is the failure this field prevents."""
    assert '"balance": the running balance' in SYSTEM_PROMPT
    assert '"balance" is not an amount' in SYSTEM_PROMPT
    assert "balance" in MAPPING_FIELDS


def test_a_balance_column_maps_to_balance_and_not_to_an_amount(
    owe1_client: Owe1TestClient,
) -> None:
    model.set_model_client(
        ScriptedClient(mapping_answer(date="Tanggal", amount_out="Debet", balance="Saldo"))
    )

    mapping = call(owe1_client)["data"]["mapping"]

    assert mapping["balance"] == "Saldo"
    assert "amount" not in mapping


# ------------------------------------------------------- cleaning rules


def test_a_column_the_model_invented_is_dropped() -> None:
    """Rule 1. A mapping naming a column that does not exist fails in the
    Rust importer as a lookup against every row of the file."""
    cleaned = clean_mapping({"date": "Tanggal", "name": "Description"}, INDONESIAN)

    assert cleaned == {"date": "Tanggal"}


def test_two_fields_never_share_a_column() -> None:
    """Rule 5. The first field in the catalog's order keeps it."""
    cleaned = clean_mapping({"name": "Keterangan", "counterparty": "Keterangan"}, INDONESIAN)

    assert cleaned == {"name": "Keterangan"}


def test_a_field_the_importer_does_not_have_is_dropped() -> None:
    cleaned = clean_mapping({"date": "Tanggal", "reference": "Saldo"}, INDONESIAN)

    assert cleaned == {"date": "Tanggal"}
    assert set(cleaned) <= set(MAPPING_FIELDS)


def test_a_currency_may_be_an_inferred_code_rather_than_a_column() -> None:
    """Rule 6, and the one exception to "every value is a column name"."""
    cleaned = clean_mapping({"date": "Tanggal", "currency": "idr"}, INDONESIAN)

    assert cleaned["currency"] == "IDR"


def test_a_currency_that_is_neither_a_column_nor_a_code_is_dropped() -> None:
    cleaned = clean_mapping({"currency": "rupiah"}, INDONESIAN)

    assert cleaned == {}


def test_a_non_string_value_is_dropped() -> None:
    cleaned = clean_mapping({"date": 3, "name": None, "balance": ["Saldo"]}, INDONESIAN)

    assert cleaned == {}


# ---------------------------------------------------------------- failure


def test_an_unusable_answer_is_a_refusal_not_a_five_hundred(
    owe1_client: Owe1TestClient,
) -> None:
    model.set_model_client(ScriptedClient(Answer(text="I could not work out the columns.")))

    response, request_id = owe1_client.request(
        "POST", "/import/map-columns", body=payload()
    )
    body = owe1_client.open_response(response, request_id)

    assert response.status_code == 422
    assert body["error"]["code"] == "COLUMN_MAPPING_FAILED"


def test_an_answer_naming_nothing_real_comes_back_empty(
    owe1_client: Owe1TestClient,
) -> None:
    """An empty mapping, not an error: the API falls back to asking the
    user which column is which, which is a better outcome than a failed
    import."""
    model.set_model_client(ScriptedClient(mapping_answer(date="Posting Date")))

    body = call(owe1_client)

    assert body["data"]["mapping"] == {}


def test_a_body_without_columns_is_refused(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient())

    response, request_id = owe1_client.request(
        "POST", "/import/map-columns", body=payload(columns=[])
    )
    body = owe1_client.open_response(response, request_id)

    assert response.status_code == 422
    assert body["error"]["code"] == "VALIDATION_FAILED"
