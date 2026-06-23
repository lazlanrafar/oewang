"""DB-backed money-path test: a real create→delete round-trip asserting the wallet
balance delta, an audit row, and soft-delete + balance restore.

SAFETY: skipped unless RUN_DB_TESTS=1 AND DATABASE_URL points at localhost — the
project's DATABASE_URL is remote PRODUCTION, and tests must never write there.
Run locally after `docker compose up -d` + `bun run db:reset`.
"""

import os
from decimal import Decimal

import pytest

from app.config import get_settings

_URL = get_settings().DATABASE_URL
_LOCAL = any(h in _URL for h in ("localhost", "127.0.0.1", "@postgres", "@db"))
pytestmark = pytest.mark.skipif(
    os.getenv("RUN_DB_TESTS") != "1" or not _LOCAL,
    reason="set RUN_DB_TESTS=1 and point DATABASE_URL at a LOCAL Postgres",
)


async def _first_wallet():
    from app.core.database import fetchrow

    return await fetchrow(
        "SELECT id, workspace_id, balance FROM wallets WHERE deleted_at IS NULL "
        "ORDER BY created_at ASC LIMIT 1"
    )


async def test_create_then_delete_round_trips_wallet_balance_and_audits():
    from app.core.database import execute, fetchrow
    from app.modules.execution.executor import execute_tool

    w = await _first_wallet()
    assert w is not None, "seed a workspace+wallet first (bun run db:reset)"
    ws, wallet_id = w["workspace_id"], w["id"]
    start = Decimal(str(w["balance"]))

    # Create a tiny expense — balance must drop by exactly the amount.
    out = await execute_tool(
        "create_transaction",
        {"type": "expense", "amount": 1.23, "name": "pytest-roundtrip", "walletId": wallet_id},
        ws,
        "pytest-user",
    )
    tx_id = out["result"]["data"]["id"]
    after_create = await fetchrow("SELECT balance FROM wallets WHERE id = $1", wallet_id)
    assert Decimal(str(after_create["balance"])) == start - Decimal("1.23")

    audit = await fetchrow(
        "SELECT 1 FROM audit_logs WHERE entity = 'transaction' AND entity_id = $1 "
        "AND action = 'transaction.created'",
        tx_id,
    )
    assert audit is not None

    # Delete — balance restored, row soft-deleted.
    await execute_tool("delete_transaction", {"id": tx_id}, ws, "pytest-user")
    restored = await fetchrow("SELECT balance FROM wallets WHERE id = $1", wallet_id)
    assert Decimal(str(restored["balance"])) == start
    gone = await fetchrow("SELECT deleted_at FROM transactions WHERE id = $1", tx_id)
    assert gone["deleted_at"] is not None

    # Test-only hard cleanup of the rows we created.
    await execute(
        "DELETE FROM audit_logs WHERE entity = 'transaction' AND entity_id = $1", tx_id
    )
    await execute("DELETE FROM transactions WHERE id = $1", tx_id)
