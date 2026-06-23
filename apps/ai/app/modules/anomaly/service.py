from collections import defaultdict

from app.config import get_settings
from app.core.currency import format_currency, get_currency_settings
from app.core.database import fetch
from app.modules.anomaly import model
from app.utils.logger import get_logger

log = get_logger("anomaly")


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

    # 1) per-transaction outliers
    for r, amt, is_out in zip(rows, amounts, model.detect_outliers(amounts, dows, cat_codes)):
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
            # ponytail: callback stub — Elysia endpoint forwards to WhatsApp/Telegram
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
