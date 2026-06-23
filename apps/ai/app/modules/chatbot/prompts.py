from app.core.currency import format_currency


def system_prompt(
    balance: float, transactions: list[dict], currency: dict | None
) -> str:
    lines = []
    for t in transactions:
        cat = t.get("category") or "Uncategorized"
        sign = "+" if t.get("type") == "income" else "-"
        amt = format_currency(float(t["amount"]), currency)
        desc = t.get("name") or t.get("description") or ""
        lines.append(f"- {sign}{amt} [{cat}] {desc}".rstrip())
    tx_block = "\n".join(lines) if lines else "(no transactions yet)"

    return (
        "You are Oewang, a friendly personal finance assistant. "
        "Always reply in English, concise and clear. "
        "Format money exactly like the example figures below.\n\n"
        f"User's current total balance: {format_currency(balance, currency)}.\n"
        f"Recent transactions:\n{tx_block}\n\n"
        "Answer the user's question based on the data above. "
        "If the data is not enough, say so honestly."
    )
