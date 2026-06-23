"""Money-path logic tests — the bits that must not silently break: multicurrency
math, wallet-delta signs, canvas thresholds, audit redaction. Pure functions, no
DB/LLM (a DB integration test lives in test_execution_db.py)."""

from datetime import datetime
from decimal import Decimal

from app.core.audit import _sanitize
from app.core.serde import to_jsonable
from app.modules.execution.executor import _artifact_for
from app.modules.execution.resolvers import resolve_date_range, resolve_multicurrency
from app.modules.execution.transactions import _apply_delta_sign


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
