import asyncio
from collections import defaultdict
from datetime import datetime

from app.config import get_settings
from app.core.currency import format_currency, get_currency_settings
from app.core.database import fetch
from app.modules.anomaly import model
from app.utils.logger import get_logger

log = get_logger("anomaly")

_MIN_HISTORY_FOR_CANDIDATES = 30

_HISTORY_QUERY = """
    SELECT t.amount, t.date, c.name AS category
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id AND c.deleted_at IS NULL
    WHERE t.workspace_id = $1 AND t.type = 'expense' AND t.deleted_at IS NULL
    ORDER BY t.date DESC
    LIMIT 500
"""


async def detect(workspace_id: str) -> list[dict]:
    rows = await fetch(
        """
        SELECT t.id, t.amount, t.date, c.name AS category
        FROM transactions t
        LEFT JOIN categories c ON c.id = t.category_id AND c.deleted_at IS NULL
        WHERE t.workspace_id = $1 AND t.type = 'expense' AND t.deleted_at IS NULL
        ORDER BY t.date DESC
        LIMIT 500
        """,
        workspace_id,
    )
    if not rows:
        return []

    currency = await get_currency_settings(workspace_id)
    amounts = [float(r["amount"]) for r in rows]
    dows = [r["date"].weekday() for r in rows]
    cats = [r["category"] or "Other" for r in rows]
    cat_index = {c: i for i, c in enumerate(sorted(set(cats)))}
    cat_codes = [cat_index[c] for c in cats]

    anomalies: list[dict] = []

    # 1) per-transaction outliers — IsolationForest.fit_predict is CPU-bound
    # numpy/sklearn work; keep it off the event loop.
    outliers = await asyncio.to_thread(
        model.detect_outliers, amounts, dows, cat_codes
    )
    for r, amt, is_out in zip(rows, amounts, outliers):
        if is_out:
            anomalies.append(
                {
                    "transaction_id": r["id"],
                    "category": r["category"] or "Other",
                    "reason": f"Unusual amount ({format_currency(amt, currency)})",
                    "severity": "warning",
                }
            )

    # 2) per-category month-over-month spikes
    by_month_cat: dict[tuple, float] = defaultdict(float)
    months = set()
    for r in rows:
        ym = (r["date"].year, r["date"].month)
        months.add(ym)
        by_month_cat[(ym, r["category"] or "Other")] += float(r["amount"])

    if len(months) >= 2:
        cur_month = max(months)
        current: dict[str, float] = {}
        history: dict[str, list[float]] = defaultdict(list)
        for (ym, cat), total in by_month_cat.items():
            if ym == cur_month:
                current[cat] = total
            else:
                history[cat].append(total)
        for sp in model.category_spikes(current, history):
            anomalies.append(
                {
                    "transaction_id": None,
                    "category": sp["category"],
                    "reason": (
                        f"{sp['category']} spending spiked "
                        f"({format_currency(sp['current'], currency)} vs average "
                        f"{format_currency(sp['avg'], currency)})"
                    ),
                    "severity": "warning",
                }
            )

    return anomalies


async def detect_candidates(workspace_id: str, candidates: list[dict]) -> list[dict]:
    """Score NEW, not-yet-persisted expense rows against the workspace's own
    history — reuses model.detect_outliers unchanged by appending the
    candidates to the same (amount, day-of-week, category) history `detect()`
    already fetches, fitting once over the combined set. Only the appended
    candidates are reported; existing history is never re-flagged here.
    candidates: [{index, amount, date (ISO string), category}], expense-only
    (the caller is expected to have already filtered to expense-type rows —
    this mirrors `detect()`'s own expense-only scope).
    """
    if not candidates:
        return []

    rows = await fetch(_HISTORY_QUERY, workspace_id)
    # Cold-start guard: with little/no real history, IsolationForest ends up
    # fitting mostly on the candidates themselves and flags a huge fraction
    # of them as "outliers" relative to each other — meaningless noise, not
    # a real signal. Skip the whole stage until there's an actual baseline.
    if len(rows) < _MIN_HISTORY_FOR_CANDIDATES:
        return []

    currency = await get_currency_settings(workspace_id)

    hist_amounts = [float(r["amount"]) for r in rows]
    hist_dows = [r["date"].weekday() for r in rows]
    hist_cats = [r["category"] or "Other" for r in rows]

    cand_amounts = [float(c["amount"]) for c in candidates]
    cand_dows = [datetime.fromisoformat(c["date"]).weekday() for c in candidates]
    cand_cats = [c.get("category") or "Other" for c in candidates]

    all_cats = hist_cats + cand_cats
    cat_index = {cat: i for i, cat in enumerate(sorted(set(all_cats)))}
    all_cat_codes = [cat_index[c] for c in all_cats]
    all_amounts = hist_amounts + cand_amounts
    all_dows = hist_dows + cand_dows

    outliers = await asyncio.to_thread(
        model.detect_outliers, all_amounts, all_dows, all_cat_codes
    )
    candidate_outliers = outliers[len(rows) :]

    anomalies: list[dict] = []
    for c, amt, is_out in zip(candidates, cand_amounts, candidate_outliers):
        if is_out:
            anomalies.append(
                {
                    "index": c["index"],
                    "reason": (
                        f"Unusual amount ({format_currency(amt, currency)}) for "
                        f"{c.get('category') or 'this category'}"
                    ),
                    "severity": "warning",
                }
            )
    return anomalies


async def scan_all_workspaces() -> None:
    """Periodic job: scan every workspace, POST anomalies to ALERT_CALLBACK_URL."""
    settings = get_settings()
    rows = await fetch("SELECT id FROM workspaces WHERE deleted_at IS NULL")
    for r in rows:
        try:
            anomalies = await detect(r["id"])
        except Exception as e:  # one workspace failing shouldn't stop the scan
            log.error("anomaly scan failed for %s: %s", r["id"], e)
            continue
        if anomalies and settings.ALERT_CALLBACK_URL:
            # ponytail: callback stub — Elysia endpoint forwards to Telegram
            import httpx

            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.post(
                        settings.ALERT_CALLBACK_URL,
                        json={"workspace_id": r["id"], "anomalies": anomalies},
                        headers={"x-api-key": settings.AI_SERVICE_API_KEY},
                    )
            except Exception as e:
                log.error("alert callback failed for %s: %s", r["id"], e)
