"""Read-only analysis builders for the canvas tools — spending, revenue, burn,
debt, budget. Output shape (stage/metrics/analysis) mirrors ai.tools.ts so the
ARTIFACT_MAP thresholds and the frontend canvases render unchanged.
"""

from datetime import date, datetime, timedelta

from app.core.database import fetch, fetchrow
from app.modules.execution.resolvers import resolve_date_range, workspace_currency


async def _list_tx(workspace_id: str, t_type: str, start: str, end: str, limit: int):
    return await fetch(
        """
        SELECT t.id, t.amount, t.date, t.name, c.name AS category_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.workspace_id = $1 AND t.deleted_at IS NULL AND t.type = $2
          AND t.date >= $3::timestamp AND t.date <= $4::timestamp
        ORDER BY t.amount DESC
        LIMIT $5
        """,
        workspace_id, t_type, start, end, limit,
    )


def _f(v) -> float:
    return float(v) if v is not None else 0.0


def _day(d: datetime | None) -> str:
    return f"{d.strftime('%b')} {d.day}" if d else "—"


def _month_key(d: datetime) -> str:
    return f"{d.strftime('%b')} {d.strftime('%y')}"


async def spending(workspace_id: str, inp: dict) -> dict:
    currency = await workspace_currency(workspace_id)
    rng = resolve_date_range(inp, "this-month")
    rows = await _list_tx(workspace_id, "expense", rng["start"], rng["end"], 50)
    total = sum(_f(r["amount"]) for r in rows)

    cats: dict[str, float] = {}
    for r in rows:
        name = r["category_name"] or "Uncategorized"
        cats[name] = cats.get(name, 0.0) + _f(r["amount"])
    top_cat = max(cats.items(), key=lambda kv: kv[1], default=None)

    txns = [{
        "id": r["id"],
        "date": _day(r["date"]),
        "vendor": r["name"] or "Unknown",
        "category": r["category_name"] or "Uncategorized",
        "amount": _f(r["amount"]),
        "share": (_f(r["amount"]) / total * 100) if total > 0 else 0,
    } for r in rows[:10]]

    top3 = ", ".join(
        f"{n} ({round(a / total * 100)}%)"
        for n, a in sorted(cats.items(), key=lambda kv: -kv[1])[:3]
    ) if total > 0 else ""
    summary = (
        f"Your total spending for the selected period is {currency} {total:.2f}, "
        f"spread across {len(rows)} transactions."
        + (f"\n\nTop categories: {top3}." if top3 else "")
        + (f"\n\n{top_cat[0]} is your largest spending category at {currency} {top_cat[1]:.2f}." if top_cat else "")
        + (f"\n\nThe single largest expense was {txns[0]['vendor']} for {currency} {txns[0]['amount']:.2f}." if txns else "")
    ) if total > 0 else "No expense transactions found for the selected period."

    return {
        "stage": "analysis_ready", "period": rng["label"],
        "from": rng["start"], "to": rng["end"], "currency": currency,
        "transactions": txns,
        "metrics": {
            "totalSpending": total, "currentPeriodSpending": total,
            "currentMonthSpending": total,
            "topCategory": {"name": top_cat[0], "amount": top_cat[1]} if top_cat else None,
        },
        "analysis": {"summary": summary},
    }


async def revenue(workspace_id: str, inp: dict) -> dict:
    currency = await workspace_currency(workspace_id)
    rng = resolve_date_range(inp, "1-year")
    rows = await _list_tx(workspace_id, "income", rng["start"], rng["end"], 200)

    monthly: dict[str, float] = {}
    for r in rows:
        monthly[_month_key(r["date"])] = monthly.get(_month_key(r["date"]), 0.0) + _f(r["amount"])
    total = sum(monthly.values())
    avg = total / len(monthly) if monthly else 0.0
    current_key = _month_key(datetime.now())
    current = monthly.get(current_key, 0.0)

    summary = (
        f"Your total revenue over the last 12 months is {currency} {total:.2f}.\n\n"
        f"Average monthly revenue is {currency} {avg:.2f}. "
        + ("This month is trending above average." if current > avg
           else "This month is below the 12-month average." if current > 0
           else "No income recorded this month yet.")
    ) if total > 0 else "No income transactions found for the last 12 months."

    return {
        "stage": "analysis_ready", "period": rng["label"],
        "from": rng["start"], "to": rng["end"], "currency": currency,
        "metrics": {
            "totalRevenue": total, "averageMonthlyRevenue": avg,
            "currentMonthRevenue": current, "revenueGrowth": 0,
        },
        "analysis": {"summary": summary},
    }


def _iter_months(start: date, end: date):
    """Yield (first_day, last_day) for each month from start's month to end's."""
    cur = date(start.year, start.month, 1)
    last = date(end.year, end.month, 1)
    while cur <= last:
        if cur.month == 12:
            nxt = date(cur.year + 1, 1, 1)
        else:
            nxt = date(cur.year, cur.month + 1, 1)
        yield cur, nxt - timedelta(days=1)
        cur = nxt


async def burn_rate(workspace_id: str, inp: dict) -> dict:
    currency = await workspace_currency(workspace_id)
    rng = resolve_date_range(inp, "last-6-months")
    start = date.fromisoformat(rng["start"])
    end = date.fromisoformat(rng["end"])

    chart = []
    for m_start, m_end in _iter_months(start, end):
        rows = await _list_tx(workspace_id, "expense", m_start.isoformat(), m_end.isoformat(), 200)
        chart.append({"label": m_start.strftime("%b"), "value": sum(_f(r["amount"]) for r in rows)})

    nonzero = [c["value"] for c in chart if c["value"] > 0]
    avg = (sum(nonzero) / len(nonzero)) if nonzero else 0.0
    summary = (
        f"Your average monthly burn rate over the last 6 months is {currency} {avg:.2f}.\n\n"
        + ("Last month's spending was above your average burn rate — consider reviewing discretionary expenses."
           if chart and chart[-1]["value"] > avg
           else "Your burn rate is stable and within your historical average.")
    ) if avg > 0 else "No expense data found for the last 6 months."

    return {
        "stage": "analysis_ready", "period": rng["label"],
        "from": rng["start"], "to": rng["end"], "currency": currency,
        "chart": chart,
        "metrics": {"avgMonthlyBurn": avg, "runway": "—"},
        "analysis": {"summary": summary},
    }


async def debt(workspace_id: str, _inp: dict) -> dict:
    currency = await workspace_currency(workspace_id)
    rows = await fetch(
        """
        SELECT d.id, d.type, d.remaining_amount, d.due_date, d.status,
               ct.name AS contact_name
        FROM debts d
        LEFT JOIN contacts ct ON d.contact_id = ct.id
        WHERE d.workspace_id = $1 AND d.deleted_at IS NULL
          AND d.remaining_amount > 0
        ORDER BY d.remaining_amount DESC
        LIMIT 100
        """,
        workspace_id,
    )
    total_payable = sum(_f(r["remaining_amount"]) for r in rows if r["type"] == "payable")
    total_receivable = sum(_f(r["remaining_amount"]) for r in rows if r["type"] == "receivable")
    net = total_receivable - total_payable
    debts_list = [{
        "id": r["id"], "contact": r["contact_name"] or "Unknown", "type": r["type"],
        "remaining": _f(r["remaining_amount"]), "due_date": _day(r["due_date"]),
        "status": r["status"],
    } for r in rows[:20]]

    payable_count = sum(1 for r in rows if r["type"] == "payable")
    summary = (
        f"You owe {currency} {total_payable:.2f} across {payable_count} payable(s), "
        f"and are owed {currency} {total_receivable:.2f}. "
        f"Net position: {'+' if net >= 0 else ''}{currency} {net:.2f}."
    ) if rows else "You have no outstanding debts or receivables."

    return {
        "stage": "analysis_ready", "currency": currency, "debts": debts_list,
        "metrics": {"totalPayable": total_payable, "totalReceivable": total_receivable,
                    "net": net, "count": len(rows)},
        "analysis": {"summary": summary},
    }


async def budget(workspace_id: str, inp: dict) -> dict:
    currency = await workspace_currency(workspace_id)
    now = datetime.now()
    month = int(inp.get("month") or now.month)
    year = int(inp.get("year") or now.year)
    start = date(year, month, 1)
    end = (date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)) - timedelta(days=1)

    rows = await fetch(
        """
        SELECT b.id, b.category_id, c.name AS category_name, b.amount,
               COALESCE(SUM(t.amount), 0) AS spent
        FROM budgets b
        JOIN categories c ON b.category_id = c.id
        LEFT JOIN transactions t ON b.category_id = t.category_id
            AND t.workspace_id = $1 AND t.type = 'expense'
            AND t.date >= $2::timestamp AND t.date <= $3::timestamp
            AND t.deleted_at IS NULL
        WHERE b.workspace_id = $1 AND b.deleted_at IS NULL
        GROUP BY b.id, c.id
        """,
        workspace_id, start.isoformat(), end.isoformat(),
    )

    items = []
    for r in rows:
        amt, spent = _f(r["amount"]), _f(r["spent"])
        items.append({
            "id": r["id"], "category": r["category_name"] or "Uncategorized",
            "amount": amt, "spent": spent,
            "percentage": round(spent / amt * 100) if amt > 0 else 0,
        })
    items.sort(key=lambda b: -b["percentage"])
    total_budget = sum(b["amount"] for b in items)
    total_spent = sum(b["spent"] for b in items)
    pct = round(total_spent / total_budget * 100) if total_budget > 0 else 0
    over = [b["category"] for b in items if b["percentage"] > 100]

    summary = (
        f"You've spent {currency} {total_spent:.2f} of your {currency} {total_budget:.2f} "
        f"budget this month ({pct}%)."
        + (f" {len(over)} categor{'y is' if len(over) == 1 else 'ies are'} over budget: {', '.join(over)}."
           if over else " You're within budget across all categories.")
    ) if items else "No budgets have been set up yet."

    return {
        "stage": "analysis_ready", "currency": currency, "budgets": items,
        "metrics": {"totalBudget": total_budget, "totalSpent": total_spent,
                    "remaining": total_budget - total_spent, "percentage": pct},
        "analysis": {"summary": summary},
    }
