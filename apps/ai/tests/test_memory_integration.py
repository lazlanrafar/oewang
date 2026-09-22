"""Real Postgres integration with deterministic OCR/model inputs.

Opt in with AI_MEMORY_TEST_URL pointing to a dedicated localhost *_test database
with migrations 0000 and 0002 applied. Never uses the application's DATABASE_URL.
"""

import os
from decimal import Decimal
from unittest.mock import AsyncMock
from urllib.parse import urlparse

import asyncpg
import pytest
import pytest_asyncio
from app.core import database, sessions, user_memory
from app.core.ids import new_id
from app.modules.chatbot import chat_money_path as chat
from app.modules.chatbot import draft

TEST_URL = os.getenv("AI_MEMORY_TEST_URL", "")
parsed_url = urlparse(TEST_URL)
pytestmark = pytest.mark.skipif(
    parsed_url.hostname not in {"localhost", "127.0.0.1"}
    or not parsed_url.path.endswith("_test"),
    reason="requires a dedicated localhost AI_MEMORY_TEST_URL ending in _test",
)


@pytest_asyncio.fixture
async def db_context(monkeypatch):
    pool = await asyncpg.create_pool(TEST_URL, min_size=1, max_size=5)
    monkeypatch.setattr(database, "_pool", pool)
    u1, u2, w1, w2, wallet = [new_id() for _ in range(5)]
    async with pool.acquire() as conn:
        # Existing migration 0000 predates these money-path columns/tables.
        # These test prerequisites mirror the existing Drizzle schema, not the feature migration.
        await conn.execute("""ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_amount numeric(19,4);
            ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_currency_code text;
            ALTER TABLE transactions ADD COLUMN IF NOT EXISTS exchange_rate numeric;
            ALTER TABLE wallets ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;
            CREATE TABLE IF NOT EXISTS transaction_items (
                id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id),
                transaction_id text NOT NULL REFERENCES transactions(id), name text NOT NULL,
                brand text, quantity numeric, unit text, unit_price numeric, amount numeric NOT NULL,
                category_id text REFERENCES categories(id), notes text,
                created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(), deleted_at timestamp);
        """)
        for user in (u1, u2):
            await conn.execute(
                "INSERT INTO users (id,email) VALUES ($1,$2)",
                user,
                user + "@test.invalid",
            )
        for ws in (w1, w2):
            await conn.execute(
                "INSERT INTO workspaces (id,name,slug) VALUES ($1,$1,$1)", ws
            )
            for user in (u1, u2):
                await conn.execute(
                    "INSERT INTO user_workspaces(id,workspace_id,user_id,role) VALUES($1,$2,$3,'owner')",
                    new_id(),
                    ws,
                    user,
                )
        await conn.execute(
            "INSERT INTO wallets(id,workspace_id,name,balance,is_default) VALUES($1,$2,'BCA',1000,true)",
            wallet,
            w1,
        )
    monkeypatch.setattr(chat, "_upgrade_title", AsyncMock())
    monkeypatch.setattr(
        chat.agent_settings_mod,
        "get_or_create",
        AsyncMock(return_value={"response_language": "english"}),
    )
    monkeypatch.setattr(
        chat,
        "fetch_wallets_and_categories",
        AsyncMock(
            return_value={"wallets": [{"id": wallet, "name": "BCA"}], "categories": []}
        ),
    )
    monkeypatch.setattr(
        chat, "_workspace_currency", AsyncMock(return_value=("IDR", "Rp"))
    )
    monkeypatch.setattr(chat.quota, "check_quota", AsyncMock(return_value=0))
    monkeypatch.setattr(
        draft, "upload_receipt_attachment", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(
        draft,
        "_parse_receipt_metered",
        AsyncMock(
            return_value={
                "name": "Shop [*]",
                "amount": 50,
                "date": "2026-09-18",
                "items": [
                    {"name": "Tea", "quantity": 2, "unitPrice": 10, "amount": 20},
                    {"name": "Cake", "quantity": None, "unitPrice": None, "amount": 30},
                ],
            }
        ),
    )
    yield u1, u2, w1, w2, wallet
    await pool.close()


async def test_should_isolate_memory_and_private_sessions_when_users_share_workspace(
    db_context,
):
    u1, u2, w1, w2, _ = db_context
    await user_memory.remember(w1, u1, "language", "language", "id", source="inferred")
    first = await user_memory.remember(
        w1, u1, "wallet", "preferred", "BCA", source="explicit"
    )
    replacement = await user_memory.remember(
        w1, u1, "wallet", "another-key", "Cash", source="explicit"
    )
    assert first["id"] == replacement["id"]
    assert len((await user_memory.load(w1, u1))["memories"]) == 2
    assert (await user_memory.load(w1, u2))["memories"] == []
    assert [m["kind"] for m in (await user_memory.load(w2, u1))["memories"]] == [
        "language"
    ]
    await user_memory.forget(w1, u2, first["id"])
    assert len((await user_memory.load(w1, u1))["memories"]) == 2
    session = await sessions.create_session(w1, "private", u1)
    await sessions.save_message(session["id"], w1, "user", "secret")
    assert await sessions.get_session(session["id"], w1, u2) is None
    assert await sessions.get_session_messages(session["id"], w1, u2) == []
    await sessions.update_title(session["id"], w1, "hacked", u2)
    assert (await sessions.get_session(session["id"], w1, u1))["title"] == "private"
    with pytest.raises(chat.SessionNotFoundError):
        await chat.chat_begin_core(
            w1, u2, [{"role": "user", "content": "hi"}], session["id"]
        )
    await user_memory.set_enabled(w1, u1, False)
    assert (await user_memory.load(w1, u1))["memories"] == []
    with pytest.raises(ValueError, match="disabled"):
        await user_memory.remember(
            w1, u1, "language", "language", "en", source="inferred"
        )
    await user_memory.set_enabled(w1, u1, True)
    await user_memory.forget(w1, u1, first["id"])
    assert len((await user_memory.load(w1, u1))["memories"]) == 1
    audit = await database.fetch(
        "SELECT after FROM audit_logs WHERE user_id=$1 AND action='ai.memory_saved'", u1
    )
    assert all(
        "Cash" not in str(row["after"]) and "BCA" not in str(row["after"])
        for row in audit
    )


async def test_should_keep_indonesian_and_save_once_when_receipt_confirmation_retried(
    db_context,
):
    u1, _, w1, _, wallet = db_context

    async def turn(text, sid=None, attachments=None):
        return await chat.chat_begin_core(
            w1, u1, [{"role": "user", "content": text, "attachments": attachments}], sid
        )

    first = await turn("Beli sarapan pisang dan snack 17k")
    sid = first["sessionId"]
    photo = [{"name": "receipt.png", "type": "image/png", "data": "eA=="}]
    preview = await turn("", sid, photo)
    assert (
        "Rincian struk" in preview["reply"]
        and "• Tea" in preview["reply"]
        and "• Cake" in preview["reply"]
    )
    selection = await turn("BCA", sid)
    assert "Akun diubah" in selection["reply"]
    pending = draft.get_latest_draft_state(
        await sessions.get_session_messages(sid, w1, u1)
    )
    saved = await turn("simpan", sid)
    assert "1 transaksi" in saved["reply"] and "2 barang" in saved["reply"]
    # Simulate response/persistence lost after DB commit, replay the same persisted draft concurrently.
    import asyncio

    await asyncio.gather(
        *(
            draft.confirm_draft_and_create_transactions(w1, u1, pending)
            for _ in range(3)
        )
    )
    assert (
        await database.fetchval(
            "SELECT count(*) FROM transactions WHERE workspace_id=$1", w1
        )
        == 1
    )
    assert (
        await database.fetchval(
            "SELECT count(*) FROM transaction_items WHERE workspace_id=$1", w1
        )
        == 2
    )
    assert await database.fetchval(
        "SELECT balance FROM wallets WHERE id=$1", wallet
    ) == Decimal(950)
    assert (
        await database.fetchval(
            "SELECT count(*) FROM audit_logs WHERE workspace_id=$1 AND action='transaction.created'",
            w1,
        )
        == 1
    )
    fresh = await turn("", None, photo)
    assert "Rincian struk" in fresh["reply"]
    switch = await turn("Please respond in English", sid)
    assert "English" in switch["systemPrompt"]
    english = await turn("", sid, photo)
    assert "Receipt preview" in english["reply"]


async def test_should_fork_legacy_archive_without_copying_private_facts(db_context):
    u1, _, w1, _, _ = db_context
    legacy = new_id()
    await database.execute(
        "INSERT INTO ai_sessions(id,workspace_id,title) VALUES($1,$2,'Archive')",
        legacy,
        w1,
    )
    await sessions.save_message(legacy, w1, "user", "Remember a private secret")
    result = await chat.chat_begin_core(
        w1, u1, [{"role": "user", "content": "hello"}], legacy
    )
    assert result["sessionId"] != legacy
    assert len(result["history"]) == 1
    assert (await sessions.get_session(legacy, w1, u1))["user_id"] is None
    assert (await user_memory.load(w1, u1))["memories"] == []


async def test_should_rollback_balance_and_transaction_when_item_write_fails(
    db_context, monkeypatch
):
    u1, _, w1, _, wallet = db_context
    from app.modules.execution import items
    from app.modules.execution.transactions import create_transaction

    monkeypatch.setattr(
        items,
        "add_transaction_items",
        AsyncMock(side_effect=RuntimeError("item failure")),
    )
    with pytest.raises(RuntimeError, match="item failure"):
        await create_transaction(
            w1,
            u1,
            {
                "wallet_id": wallet,
                "type": "expense",
                "amount": 50,
                "receipt_items": [{"name": "Tea", "amount": 50}],
            },
        )
    assert (
        await database.fetchval(
            "SELECT count(*) FROM transactions WHERE workspace_id=$1", w1
        )
        == 0
    )
    assert await database.fetchval(
        "SELECT balance FROM wallets WHERE id=$1", wallet
    ) == Decimal(1000)


async def test_should_continue_in_session_language_when_memory_read_fails(
    db_context, monkeypatch
):
    u1, _, w1, _, _ = db_context
    first = await chat.chat_begin_core(
        w1, u1, [{"role": "user", "content": "Tolong pakai bahasa Indonesia"}]
    )

    async def unavailable(*args, **kwargs):
        raise RuntimeError("memory table unavailable")

    monkeypatch.setattr(user_memory, "fetch", unavailable)
    result = await chat.chat_begin_core(
        w1,
        u1,
        [
            {
                "role": "user",
                "content": "",
                "attachments": [{"name": "r.png", "type": "image/png", "data": "eA=="}],
            }
        ],
        first["sessionId"],
    )
    assert "Rincian struk" in result["reply"]


async def test_should_never_load_private_session_into_nonpersonal_channel(db_context):
    u1, _, w1, _, _ = db_context
    session = await sessions.create_session(w1, "Personal", u1, personal_memory=True)
    with pytest.raises(chat.SessionNotFoundError):
        await chat.chat_begin_core(
            w1,
            u1,
            [{"role": "user", "content": "hi"}],
            session["id"],
            personal_memory=False,
        )


async def test_should_reuse_preferences_across_verified_channels_but_not_workspaces(
    db_context,
):
    u1, _, w1, w2, _ = db_context
    await user_memory.remember(w1, u1, "language", "language", "id", source="inferred")
    await user_memory.remember(w1, u1, "style", "style", "concise", source="inferred")
    await user_memory.remember(w1, u1, "wallet", "wallet", "BCA", source="explicit")
    # Both web and verified Telegram use personal_memory=True with authenticated identities.
    app = await chat.chat_begin_core(
        w1, u1, [{"role": "user", "content": "hi"}], personal_memory=True
    )
    telegram = await chat.chat_begin_core(
        w1, u1, [{"role": "user", "content": "hi"}], personal_memory=True
    )
    other_ws = await chat.chat_begin_core(
        w2, u1, [{"role": "user", "content": "hi"}], personal_memory=True
    )
    assert app["sessionId"] != telegram["sessionId"]
    assert "Bahasa Indonesia" in telegram["systemPrompt"]
    assert "concise" in other_ws["systemPrompt"]
    assert '"kind": "wallet"' not in other_ws["systemPrompt"]
    assert '"kind": "wallet"' in telegram["systemPrompt"]


async def test_should_manage_memory_through_authenticated_chat_with_controlled_model(
    db_context, monkeypatch
):
    from app.core import auth
    from app.modules.chatbot import service

    u1, u2, w1, _, _ = db_context
    monkeypatch.setattr(
        auth, "get_auth", AsyncMock(return_value={"workspace_id": w1, "user_id": u1})
    )

    async def model(system, history, definitions, execute, **kwargs):
        result = await execute(
            "manage_memory",
            {
                "operation": "remember",
                "kind": "wallet",
                "key": "preferred_wallet",
                "value": "BCA",
                "evidence": "remember my wallet BCA",
                "user_id": u2,
                "workspace_id": "spoofed",
            },
        )
        assert result["result"]["success"]
        return {
            "reply": "Remembered BCA",
            "usage": {"input_tokens": 0, "output_tokens": 0},
            "artifacts": [],
        }

    monkeypatch.setattr(service.llm, "complete_with_tools", model)
    result = await service.web_chat(
        [{"role": "user", "content": "remember my wallet BCA"}], "test-jwt", None, False
    )
    assert result["session_id"]
    assert user_memory.value_for(await user_memory.load(w1, u1), "wallet") == "BCA"
    assert user_memory.value_for(await user_memory.load(w1, u2), "wallet") is None
    listing = await chat.chat_begin_core(
        w1,
        u1,
        [{"role": "user", "content": "apa yang kamu ingat?"}],
        result["session_id"],
    )
    assert "BCA" in listing["reply"]
