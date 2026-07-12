from app.core import llm
from app.core.currency import format_currency, get_currency_settings
from app.core.database import fetch
from app.modules.advisor.retriever import search


async def _spending_profile(workspace_id: str, currency: dict | None) -> str:
    rows = await fetch(
        """
        SELECT c.name AS category, COALESCE(SUM(t.amount), 0) AS total
        FROM transactions t
        LEFT JOIN categories c ON c.id = t.category_id AND c.deleted_at IS NULL
        WHERE t.workspace_id = $1 AND t.type = 'expense' AND t.deleted_at IS NULL
        GROUP BY c.name
        ORDER BY total DESC
        LIMIT 5
        """,
        workspace_id,
    )
    if not rows:
        return ""
    return "; ".join(
        f"{r['category'] or 'Uncategorized'}: {format_currency(float(r['total']), currency)}"
        for r in rows
    )


async def advise(question: str, workspace_id: str) -> dict:
    chunks = await search(question)
    currency = await get_currency_settings(workspace_id)
    profile = await _spending_profile(workspace_id, currency)

    context = "\n\n".join(f"[{c['source']}]\n{c['content']}" for c in chunks)
    system = (
        "You are a financial advisor for users in Indonesia. "
        "Answer in English based on the CONTEXT below. "
        "If the context is not relevant to the question, say you don't have "
        "enough information. Add a short disclaimer when tax is involved."
    )
    user = f"CONTEXT:\n{context or '(empty)'}\n\n"
    if profile:
        user += f"USER SPENDING PROFILE (top categories): {profile}\n\n"
    user += f"QUESTION: {question}"

    answer = await llm.complete_metered(
        system, [{"role": "user", "content": user}], workspace_id
    )
    sources = sorted({c["source"] for c in chunks})
    return {"answer": answer, "sources": sources}
