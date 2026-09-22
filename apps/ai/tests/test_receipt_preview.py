from unittest.mock import AsyncMock

from app.modules.chatbot import draft
from app.modules.chatbot.receipt_preview import render


def entry(items, name="Merchant [*]"):
    return {
        "name": name,
        "amount": 100,
        "items": items,
        "walletId": "w",
        "receiptDate": "2026-09-18",
    }


def test_should_show_every_item_when_receipts_are_long():
    items = [
        {"name": f"Item {i}", "quantity": 2, "unitPrice": 10, "amount": 20}
        for i in range(300)
    ]
    text = render(
        [entry(items), entry([{"name": "Other", "amount": 100}], "Second")],
        [{"id": "w", "name": "BCA"}],
        "id",
    )
    assert text.count("• ") == 301
    assert "2 × IDR 10" in text and "Item 299" in text
    assert "2. Second" in text and "Merchant [*]" in text
    assert "berbeda dengan total" in text
    assert "Akun: BCA" in text


def test_should_not_invent_missing_values_when_ocr_is_incomplete():
    text = render([entry([{"name": "Tea", "amount": None}])], [], "en")
    assert "subtotal unreadable" in text
    assert "×" not in text
    assert "IDR 0" not in text


async def test_should_not_save_when_user_cancels_even_with_save_word(monkeypatch):
    save = AsyncMock()
    monkeypatch.setattr(draft, "confirm_draft_and_create_transactions", save)
    monkeypatch.setattr(draft.sessions, "save_message", AsyncMock())
    result = await draft.handle_pending_invoice_draft(
        "w",
        "u",
        {"content": "tidak jadi simpan"},
        {"status": "awaiting_confirmation", "language": "id"},
        "s",
    )
    assert "Dibatalkan" in result["reply"]
    save.assert_not_awaited()


async def test_should_not_report_saved_when_transaction_write_fails(monkeypatch):
    monkeypatch.setattr(
        draft, "create_transaction", AsyncMock(return_value={"success": False})
    )
    row = {**entry([]), "date": "2026-09-18", "fileName": "r.png"}
    result = await draft.confirm_draft_and_create_transactions(
        "w", "u", {"language": "id", "entries": [row]}
    )
    assert result["createdCount"] == 0 and not result["complete"]
    assert "belum" in result["reply"]


def test_should_preserve_decimal_quantity_when_ocr_has_fractional_items():
    text = render(
        [
            entry(
                [{"name": "Fruit", "quantity": 0.125, "unitPrice": 100, "amount": 12.5}]
            )
        ],
        [],
        "id",
    )
    assert "0,125 × IDR 100" in text
    assert "IDR 12,5" in text


def test_should_not_confirm_when_user_asks_about_saving():
    for text in [
        "how do I save?",
        "can I save tomorrow?",
        "belum mau simpan",
        "apa yang terjadi kalau simpan?",
        "not save",
    ]:
        assert not draft.is_confirm_intent(text)
    assert draft.is_confirm_intent("tolong simpan")
