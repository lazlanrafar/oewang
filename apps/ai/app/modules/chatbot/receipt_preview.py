"""Plain-text receipt rendering. OCR fields are displayed as data, never markup."""

from decimal import Decimal

from app.modules.chatbot.language import say


def money(value: object) -> str:
    if value is None:
        return "?"
    number = Decimal(str(value))
    formatted = f"{number:,f}"
    if "." in formatted:
        formatted = formatted.rstrip("0").rstrip(".")
    return formatted.replace(",", "_").replace(".", ",").replace("_", ".")


def render(
    entries: list[dict], wallets: list[dict], language: str, currency: str = "IDR"
) -> str:
    names = {w["id"]: w["name"] for w in wallets}
    lines = [
        say(
            language,
            "Receipt preview — please confirm before saving.",
            "Rincian struk — mohon konfirmasi sebelum disimpan.",
        )
    ]
    for index, entry in enumerate(entries, 1):
        lines += [
            "",
            f"{index}. {entry['name']}",
            say(language, "Date: ", "Tanggal: ")
            + (
                entry.get("receiptDate") or say(language, "unreadable", "tidak terbaca")
            ),
            say(language, "Account: ", "Akun: ")
            + names.get(entry.get("walletId"), "-"),
        ]
        items = entry.get("items") or []
        for item in items:
            detail = ""
            if item.get("quantity") is not None and item.get("unitPrice") is not None:
                detail = f" ({money(item['quantity'])} × {currency} {money(item['unitPrice'])})"
            subtotal = (
                f"{currency} {money(item['amount'])}"
                if item.get("amount") is not None
                else say(language, "subtotal unreadable", "subtotal tidak terbaca")
            )
            lines.append(f"• {item['name']}{detail} — {subtotal}")
        if not items:
            lines.append(
                say(
                    language,
                    "Item details are unreadable.",
                    "Rincian barang tidak terbaca.",
                )
            )
        lines.append(f"Total: {currency} {money(entry['amount'])}")
        if items and all(i.get("amount") is not None for i in items):
            subtotal = sum(Decimal(str(i["amount"])) for i in items)
            if abs(subtotal - Decimal(str(entry["amount"]))) > Decimal("0.01"):
                lines.append(
                    say(
                        language,
                        f"Item subtotals ({currency} {money(subtotal)}) differ from the receipt total. Please check; the total has not been changed.",
                        f"Jumlah subtotal barang ({currency} {money(subtotal)}) berbeda dengan total struk. Mohon periksa; total tidak diubah.",
                    )
                )
    lines += [
        "",
        say(
            language,
            "To change account, reply: account: <name>",
            "Untuk mengganti akun, balas: akun: <nama>",
        ),
        say(
            language,
            "Reply confirm to save, or cancel.",
            "Balas simpan untuk menyimpan, atau batal.",
        ),
    ]
    return "\n".join(lines)
