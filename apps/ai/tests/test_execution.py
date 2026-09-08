"""Money-path logic tests — the bits that must not silently break: multicurrency
math, wallet-delta signs, canvas thresholds, audit redaction. Pure functions, no
DB/LLM (a DB integration test lives in test_execution_db.py)."""

from datetime import datetime
from decimal import Decimal

from app.core.audit import _sanitize
from app.core.serde import to_jsonable
from app.modules.chatbot.draft import is_document_upload_intent
from app.modules.execution.debts import _derive_debt_status
from app.modules.execution.executor import _artifact_for
from app.modules.execution.exports import _rows_to_csv
from app.modules.execution.resolvers import (
    _match_category,
    parse_amount,
    resolve_date_range,
    resolve_multicurrency,
)
from app.modules.execution.transactions import _apply_delta_sign

import pytest


def test_parse_amount_accepts_positive():
    assert parse_amount(1500) == Decimal("1500")
    assert parse_amount("0", allow_zero=True) == Decimal("0")


def test_parse_amount_rejects_negative_nan_and_infinity():
    for bad in (-1, "-0.01", float("nan"), float("inf"), "NaN", "Infinity"):
        with pytest.raises(ValueError):
            parse_amount(bad)


def test_multicurrency_rejects_nan_amount():
    # A NaN amount would poison wallet balances (NaN propagates), so reject it.
    with pytest.raises(ValueError):
        resolve_multicurrency({"amount": float("nan")})


def test_multicurrency_passthrough_when_main_currency():
    out = resolve_multicurrency({"amount": 50000})
    assert out["amount"] == Decimal("50000")
    assert out["original_amount"] is None
    assert out["exchange_rate"] is None


def test_multicurrency_recomputes_main_amount_from_original_times_rate():
    # 100 USD at 15,000 → 1,500,000 main currency, server-derived (not client-trusted).
    out = resolve_multicurrency(
        {"amount": 999, "originalAmount": 100, "originalCurrencyCode": "USD", "exchangeRate": 15000}
    )
    assert out["amount"] == Decimal("1500000.0000")
    assert out["original_currency_code"] == "USD"


def test_wallet_delta_sign_by_type():
    v = Decimal("100")
    assert _apply_delta_sign("income", v) == Decimal("100")   # income credits
    assert _apply_delta_sign("expense", v) == Decimal("-100")  # expense debits
    assert _apply_delta_sign("transfer", v) == Decimal("-100")  # transfer leaves source


def test_spending_artifact_only_emits_when_total_positive():
    hit = _artifact_for("getSpendingAnalysis", {"data": {"metrics": {"totalSpending": 500}}})
    assert hit == {"type": "spending-canvas", "payload": {"metrics": {"totalSpending": 500}}}

    miss = _artifact_for("getSpendingAnalysis", {"data": {"metrics": {"totalSpending": 0}}})
    assert miss is None


def test_budget_artifact_requires_budgets_list():
    assert _artifact_for("getBudgetStatus", {"data": {"budgets": [{"id": "x"}]}})["type"] == "budget-canvas"
    assert _artifact_for("getBudgetStatus", {"data": {"budgets": []}}) is None


def test_non_canvas_tool_has_no_artifact():
    assert _artifact_for("create_transaction", {"success": True, "data": {}}) is None


def test_file_attachment_artifact_always_emits_on_success_with_url():
    result = {"success": True, "data": {"url": "https://r2/x", "name": "a.csv", "mime_type": "text/csv"}}
    artifact = _artifact_for("export_transactions", result)
    assert artifact == {
        "type": "file-attachment",
        "payload": {"url": "https://r2/x", "name": "a.csv", "mimeType": "text/csv"},
    }


def test_file_attachment_artifact_omitted_when_tool_failed():
    assert _artifact_for("get_receipt_attachment", {"success": False, "error": "no receipt"}) is None


def test_rows_to_csv_writes_header_and_one_row_per_transaction():
    rows = [{"date": "2026-09-01", "type": "expense", "name": "Kopi", "category_name": "Food",
             "wallet_name": "Cash", "amount": "15000"}]
    csv_text = _rows_to_csv(rows)
    lines = csv_text.strip().splitlines()
    assert lines[0] == "Date,Type,Name,Category,Wallet,Amount"
    assert lines[1] == "2026-09-01,expense,Kopi,Food,Cash,15000"


def test_match_category_finds_substring_and_word_overlap_matches():
    rows = [{"id": "c1", "name": "Household"}, {"id": "c2", "name": "Groceries"}]
    assert _match_category(rows, "household")["id"] == "c1"
    assert _match_category(rows, "beli groceries bulanan")["id"] == "c2"


def test_match_category_returns_none_when_nothing_fits():
    # No fallback guessing here — resolve_or_create_category_id relies on this
    # None to decide "create a new category" instead of picking a wrong one.
    rows = [{"id": "c1", "name": "Household"}, {"id": "c2", "name": "Groceries"}]
    assert _match_category(rows, "Transportasi") is None


def test_audit_redacts_sensitive_keys_recursively():
    cleaned = _sanitize({"name": "ok", "token": "abc", "nested": {"api_key": "xyz"}})
    assert cleaned == {"name": "ok", "token": "[REDACTED]", "nested": {"api_key": "[REDACTED]"}}


def test_to_jsonable_handles_decimal_and_datetime():
    out = to_jsonable({"amount": Decimal("12.50"), "at": datetime(2026, 6, 23, 10, 0)})
    assert out["amount"] == 12.5
    assert out["at"].startswith("2026-06-23T10:00")


def test_date_range_this_month_starts_on_the_first():
    rng = resolve_date_range({"period": "this-month"}, "this-month")
    assert rng["start"].endswith("-01")
    assert rng["label"] == "this-month"


def test_derive_debt_status_paid_partial_unpaid_boundaries():
    from decimal import Decimal
    assert _derive_debt_status(Decimal("0"), Decimal("100")) == "paid"
    assert _derive_debt_status(Decimal("-5"), Decimal("100")) == "paid"  # over-payment clamps to paid
    assert _derive_debt_status(Decimal("50"), Decimal("100")) == "partial"
    assert _derive_debt_status(Decimal("100"), Decimal("100")) == "unpaid"  # untouched, full amount still owed


def test_derive_debt_status_after_amount_increase_past_a_partial_payment():
    from decimal import Decimal
    # Debt was 100, user paid 60 (remaining 40, partial). Amount edited up to 150
    # → remaining grows by the same diff (40 + 50 = 90), still partial.
    assert _derive_debt_status(Decimal("90"), Decimal("150")) == "partial"


def test_is_document_upload_intent_matches_indonesian_and_english_phrases():
    assert is_document_upload_intent("ini bukan struk, simpan aja ya")
    assert is_document_upload_intent("please save this document")
    assert is_document_upload_intent("tolong arsipkan file ini")


def test_is_document_upload_intent_false_for_plain_receipt_messages():
    assert not is_document_upload_intent("")
    assert not is_document_upload_intent("beli kopi 25k")
    assert not is_document_upload_intent("ini struk belanja bulanan")
