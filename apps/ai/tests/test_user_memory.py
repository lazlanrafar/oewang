"""Privacy and failure semantics without network/model dependencies."""

from unittest.mock import AsyncMock

import pytest
from app.core import user_memory as memory
from app.modules.chatbot import memory_controls
from app.modules.chatbot.language import detect_language, detect_style, resolve_language


@pytest.mark.parametrize(
    "text",
    [
        "",
        "[receipt photo]",
        "BCA",
        "17000",
        "simpan",
        "confirm",
        "ok",
        "yes",
        "ya",
        "Cash",
        "save",
    ],
)
def test_should_keep_language_when_message_has_no_language_evidence(text):
    assert resolve_language(text, "id", "en", "english", ["BCA", "Cash"]) == "id"


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Beli sarapan pisang dan snack 17k", "id"),
        ("Please record my lunch expense", "en"),
        ("Reply in English", "en"),
        ("pakai bahasa Indonesia", "id"),
        ("English please", "en"),
    ],
)
def test_should_select_language_when_message_is_clear(text, expected):
    assert detect_language(text) == expected


def test_should_apply_precedence_when_preferences_differ():
    assert (
        resolve_language("Please record my expense", "id", "id", "indonesian") == "en"
    )
    assert resolve_language("", None, "id", "english") == "id"
    assert resolve_language("", None, None, "indonesian") == "id"
    assert resolve_language("saya want beli receipt", "id") == "id"
    assert resolve_language("") == "en"
    assert detect_style("tolong jawab singkat") == "concise"


async def test_should_never_read_when_personal_identity_unverified(monkeypatch):
    read = AsyncMock(side_effect=AssertionError("must not query"))
    monkeypatch.setattr(memory, "fetchrow", read)
    assert (await memory.load("w", "fallback-user", personal=False))["memories"] == []
    read.assert_not_awaited()


async def test_should_skip_values_when_memory_disabled(monkeypatch):
    monkeypatch.setattr(memory, "assert_member", AsyncMock())
    monkeypatch.setattr(
        memory, "fetchrow", AsyncMock(return_value={"ai_memory_enabled": False})
    )
    values = AsyncMock()
    monkeypatch.setattr(memory, "fetch", values)
    assert not (await memory.load("w", "u"))["enabled"]
    values.assert_not_awaited()


async def test_should_fail_closed_when_memory_store_fails(monkeypatch):
    monkeypatch.setattr(
        memory, "assert_member", AsyncMock(side_effect=RuntimeError("offline"))
    )
    assert await memory.load("w", "u") == {
        "enabled": False,
        "available": False,
        "memories": [],
    }


async def test_should_deny_when_user_is_not_workspace_member(monkeypatch):
    monkeypatch.setattr(memory, "fetchrow", AsyncMock(return_value=None))
    with pytest.raises(PermissionError):
        await memory.load("w", "u")


@pytest.mark.parametrize("kind", ["fact", "wallet", "category"])
async def test_should_refuse_automatic_financial_memory_when_source_inferred(kind):
    with pytest.raises(ValueError, match="Explicit"):
        await memory.remember("w", "u", kind, "key", "value", source="inferred")


async def test_should_require_actual_user_evidence_when_model_requests_memory(
    monkeypatch,
):
    monkeypatch.setattr(
        memory,
        "load",
        AsyncMock(return_value={"enabled": True, "available": True, "memories": []}),
    )
    save = AsyncMock()
    monkeypatch.setattr(memory, "remember", save)
    args = {
        "operation": "remember",
        "kind": "wallet",
        "key": "wallet",
        "value": "BCA",
        "evidence": "ingat BCA",
    }
    result = await memory.tool(
        "w", "u", args, evidence="[receipt photo]", personal=True
    )
    assert not result["success"]
    result = await memory.tool(
        "w", "u", args, evidence="ganti akun ke BCA", personal=True
    )
    assert not result["success"]
    save.assert_not_awaited()
    save.return_value = {"id": "m1"}
    assert (
        await memory.tool("w", "u", args, evidence="tolong ingat BCA", personal=True)
    )["success"]
    assert save.call_args.args[:2] == ("w", "u")


async def test_should_require_confirmation_when_deleting_all(monkeypatch):
    erase = AsyncMock()
    monkeypatch.setattr(memory, "forget", erase)
    context = {}
    state = {"enabled": True, "available": True, "memories": []}
    reply = await memory_controls.handle(
        "w", "u", "hapus semua memori", context, state, "id", personal=True
    )
    assert "konfirmasi" in reply
    erase.assert_not_awaited()
    assert (
        await memory_controls.handle(
            "w", "u", "yes", context, state, "id", personal=True
        )
        is None
    )
    await memory_controls.handle(
        "w", "u", "konfirmasi hapus semua memori", context, state, "id", personal=True
    )
    erase.assert_awaited_once_with("w", "u", all_memories=True)


async def test_should_not_claim_saved_when_toggle_fails(monkeypatch):
    monkeypatch.setattr(memory, "set_enabled", AsyncMock(side_effect=RuntimeError()))
    reply = await memory_controls.handle(
        "w", "u", "aktifkan memori", {}, {}, "id", personal=True
    )
    assert "belum dapat dikonfirmasi" in reply


@pytest.mark.parametrize(
    "text", ["I had lunch today", "Can you show the balance", "Good morning"]
)
def test_should_switch_to_english_when_user_writes_clear_english(text):
    assert resolve_language(text, "id") == "en"


async def test_should_not_bypass_delete_confirmation_when_model_loops_over_memories(
    monkeypatch,
):
    monkeypatch.setattr(
        memory,
        "load",
        AsyncMock(
            return_value={"enabled": True, "available": True, "memories": [{"id": "m"}]}
        ),
    )
    erase = AsyncMock()
    monkeypatch.setattr(memory, "forget", erase)
    result = await memory.tool(
        "w",
        "u",
        {"operation": "forget", "id": "m"},
        evidence="please forget everything",
        personal=True,
    )
    assert not result["success"]
    erase.assert_not_awaited()
