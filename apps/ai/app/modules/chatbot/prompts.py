from functools import lru_cache
from pathlib import Path

from app.core.currency import format_currency

PERSONA_PATH = Path(__file__).resolve().parents[2] / "core" / "persona.md"


@lru_cache(maxsize=1)
def _persona() -> str:
    return PERSONA_PATH.read_text().strip()


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
        f"{_persona()}\n\n"
        "If a question has multiple parts, make sure your answer covers every "
        "part before you finish — don't drop one. Never guess a number that "
        "isn't in the data below; say plainly if something isn't available. "
        "Format money exactly like the example figures below.\n"
        "The user CAN send a photo of a receipt directly in this chat — it is "
        "read automatically and turned into a draft transaction they confirm "
        "before it's saved. If asked, say yes, receipt photos are supported.\n\n"
        f"User's current total balance: {format_currency(balance, currency)}.\n"
        f"Recent transactions:\n{tx_block}\n\n"
        "Answer the user's question based on the data above. "
        "If the data is not enough, say so honestly."
    )
