"""Receipt-draft short-circuit — port of ai.service.ts's getLatestDraftState /
handlePendingInvoiceDraft / buildInvoiceDraftFromAttachments. Covers the 5
handle_pending_invoice_draft branches (cancel / confirm / wallet-unresolved /
wallet-resolved / fallback) plus the intent/wallet-name helpers.
"""

import json

import app.modules.chatbot.draft as draft_mod

_WALLETS = [
    {"id": "w-bca", "name": "BCA", "isDefault": True},
    {"id": "w-cash", "name": "Cash", "isDefault": False},
]


def _draft(entries=None, wallets=None, status="awaiting_confirmation"):
    return {
        "status": status,
        "createdAt": "2026-01-01T00:00:00+00:00",
        "wallets": wallets if wallets is not None else _WALLETS,
        "entries": entries
        if entries is not None
        else [
            {
                "fileName": "r.png",
                "amount": 15000,
                "date": "2026-01-01T00:00:00+00:00",
                "name": "Coffee",
                "categoryId": None,
                "walletId": "w-bca",
                "attachmentIds": None,
                "items": [],
            }
        ],
    }


# ── Intent / wallet-name helpers ────────────────────────────────────────────


def test_is_confirm_intent_matches_variants():
    for text in ["confirm", "Yes", "ok please", "simpan", "lanjut aja"]:
        assert draft_mod.is_confirm_intent(text) is True
    assert draft_mod.is_confirm_intent("what's my balance") is False


def test_is_cancel_intent_matches_variants():
    for text in ["cancel", "batal dong", "jangan"]:
        assert draft_mod.is_cancel_intent(text) is True
    assert draft_mod.is_cancel_intent("confirm") is False


def test_extract_requested_wallet_name_explicit_form():
    assert draft_mod.extract_requested_wallet_name("account: Cash", _WALLETS) == "Cash"


def test_extract_requested_wallet_name_from_mention():
    assert draft_mod.extract_requested_wallet_name("use my cash please", _WALLETS) == "Cash"


def test_extract_requested_wallet_name_none_when_absent():
    assert draft_mod.extract_requested_wallet_name("confirm", _WALLETS) is None


def test_resolve_wallet_by_name_exact_and_fuzzy():
    assert draft_mod.resolve_wallet_by_name(_WALLETS, "Cash")["id"] == "w-cash"
    assert draft_mod.resolve_wallet_by_name(_WALLETS, "cas")["id"] == "w-cash"
    assert draft_mod.resolve_wallet_by_name(_WALLETS, "nonexistent") is None


def test_get_latest_draft_state_scans_backwards():
    history = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "old", "attachments": json.dumps({"invoiceDraft": {"status": "confirmed"}})},
        {"role": "user", "content": "another"},
        {"role": "assistant", "content": "new", "attachments": json.dumps({"invoiceDraft": {"status": "awaiting_confirmation"}})},
    ]
    result = draft_mod.get_latest_draft_state(history)
    assert result == {"status": "awaiting_confirmation"}


def test_get_latest_draft_state_none_when_no_draft():
    history = [{"role": "assistant", "content": "hi", "attachments": None}]
    assert draft_mod.get_latest_draft_state(history) is None


# ── handle_pending_invoice_draft: 5 branches ────────────────────────────────


async def _save_message_capture(monkeypatch):
    captured = {}

    async def fake_save_message(session_id, workspace_id, role, content, attachments=None):
        captured["session_id"] = session_id
        captured["role"] = role
        captured["content"] = content
        captured["attachments"] = attachments

    monkeypatch.setattr(draft_mod.sessions, "save_message", fake_save_message)
    return captured


async def test_handle_pending_draft_cancel_branch(monkeypatch):
    captured = await _save_message_capture(monkeypatch)
    result = await draft_mod.handle_pending_invoice_draft(
        "ws1", "u1", {"role": "user", "content": "cancel"}, _draft(), "s1"
    )
    assert result["reply"] == "Cancelled. I did not save any transaction from this receipt."
    assert captured["attachments"]["invoiceDraft"]["status"] == "cancelled"


async def test_handle_pending_draft_confirm_branch(monkeypatch):
    captured = await _save_message_capture(monkeypatch)

    async def fake_confirm(workspace_id, user_id, draft, wallet_override_id=None):
        return {"reply": "Saved 1 transaction.\n- Coffee — IDR 15.000", "createdCount": 1}

    monkeypatch.setattr(draft_mod, "confirm_draft_and_create_transactions", fake_confirm)
    result = await draft_mod.handle_pending_invoice_draft(
        "ws1", "u1", {"role": "user", "content": "confirm"}, _draft(), "s1"
    )
    assert "Saved 1 transaction" in result["reply"]
    assert captured["attachments"]["invoiceDraft"]["status"] == "confirmed"


async def test_handle_pending_draft_wallet_name_unresolved_branch(monkeypatch):
    captured = await _save_message_capture(monkeypatch)
    result = await draft_mod.handle_pending_invoice_draft(
        "ws1", "u1", {"role": "user", "content": "account: Mandiri"}, _draft(), "s1"
    )
    assert 'cannot find account "Mandiri"' in result["reply"]
    assert captured["attachments"]["invoiceDraft"]["status"] == "awaiting_confirmation"


async def test_handle_pending_draft_wallet_resolved_branch(monkeypatch):
    captured = await _save_message_capture(monkeypatch)
    result = await draft_mod.handle_pending_invoice_draft(
        "ws1", "u1", {"role": "user", "content": "account: Cash"}, _draft(), "s1"
    )
    assert 'Account updated to "Cash"' in result["reply"]
    assert captured["attachments"]["invoiceDraft"]["entries"][0]["walletId"] == "w-cash"


async def test_handle_pending_draft_fallback_branch(monkeypatch):
    await _save_message_capture(monkeypatch)
    result = await draft_mod.handle_pending_invoice_draft(
        "ws1", "u1", {"role": "user", "content": "hmm not sure"}, _draft(), "s1"
    )
    assert "Draft is ready" in result["reply"]
    assert 'account: "BCA"' in result["reply"]


async def test_handle_pending_draft_returns_none_when_not_awaiting_confirmation(monkeypatch):
    result = await draft_mod.handle_pending_invoice_draft(
        "ws1", "u1", {"role": "user", "content": "confirm"}, _draft(status="confirmed"), "s1"
    )
    assert result is None
