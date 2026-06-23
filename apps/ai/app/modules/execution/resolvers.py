"""Shared helpers for tool execution: fuzzy wallet/category resolution, the
main-currency derivation, and date-range parsing. Ports the equivalents in
apps/api/modules/ai/ai.tools.ts so AI writes land on the right rows.
"""

import re
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.core.database import fetch, fetchrow


def _clean(s: str) -> str:
    return re.sub(r"[^\w\s]", "", s).strip().lower()


async def resolve_wallet_id(workspace_id: str, wallet_ref: str | None) -> str:
    """Map a wallet id-or-name (whatever the model passed) to a real wallet id.
    Falls back to the default wallet, then the first wallet. '' if none."""
    if not wallet_ref:
        row = await fetchrow(
            "SELECT id FROM wallets WHERE workspace_id = $1 AND is_default = true "
            "AND deleted_at IS NULL LIMIT 1",
            workspace_id,
        )
        return row["id"] if row else ""

    rows = await fetch(
        "SELECT id, name, is_default FROM wallets WHERE workspace_id = $1 "
        "AND deleted_at IS NULL ORDER BY sort_order ASC, created_at DESC",
        workspace_id,
    )
    if not rows:
        return ""

    # 0. Exact id match (ids are CUID2 — honour a recalled real id first).
    for w in rows:
        if w["id"] == wallet_ref:
            return w["id"]

    lowered = wallet_ref.lower().strip()
    # 1. Exact / substring either direction.
    for w in rows:
        n = w["name"].lower()
        if n == lowered or lowered in n or n in lowered:
            return w["id"]
    # 2. Word-level overlap.
    words = lowered.split()
    for w in rows:
        n = w["name"].lower()
        if any(len(word) > 1 and word in n for word in words):
            return w["id"]
    # 3. Default, then first.
    for w in rows:
        if w["is_default"]:
            return w["id"]
    return rows[0]["id"]


async def resolve_category_id(workspace_id: str, cat_ref: str | None) -> str | None:
    if not cat_ref:
        return None
    rows = await fetch(
        "SELECT id, name FROM categories WHERE workspace_id = $1 "
        "AND deleted_at IS NULL",
        workspace_id,
    )
    if not rows:
        return None

    for c in rows:  # 0. exact id
        if c["id"] == cat_ref:
            return c["id"]

    lowered = cat_ref.lower().strip()
    clean_input = _clean(lowered)
    # 1. substring (raw + emoji-stripped) either direction
    for c in rows:
        cn = c["name"].lower()
        cc = _clean(c["name"])
        if lowered in cn or cn in lowered or clean_input in cc or cc in clean_input:
            return c["id"]
    # 2. word overlap
    words = clean_input.split()
    for c in rows:
        cc = _clean(c["name"])
        if any(len(w) > 2 and w in cc for w in words):
            return c["id"]
    # 3. an "other"/"lain"/"general" bucket, else first
    for c in rows:
        n = c["name"].lower()
        if "other" in n or "lain" in n or "general" in n:
            return c["id"]
    return rows[0]["id"]


async def workspace_currency(workspace_id: str) -> str:
    row = await fetchrow(
        "SELECT main_currency_code FROM workspace_settings "
        "WHERE workspace_id = $1 AND deleted_at IS NULL LIMIT 1",
        workspace_id,
    )
    return (row and row["main_currency_code"]) or "USD"


def resolve_multicurrency(inp: dict) -> dict:
    """Derive the stored main-currency `amount` server-side. When the user picks a
    non-main currency the model sends original_amount + exchange_rate; recompute
    `amount` so it can't be tampered with. Mirrors resolveMulticurrency (TS)."""
    code = inp.get("originalCurrencyCode")
    orig = inp.get("originalAmount")
    rate = inp.get("exchangeRate")
    if code is not None and orig is not None and rate is not None:
        main = (Decimal(str(orig)) * Decimal(str(rate))).quantize(Decimal("0.0001"))
        return {
            "amount": main,
            "original_amount": Decimal(str(orig)),
            "original_currency_code": code,
            "exchange_rate": Decimal(str(rate)),
        }
    return {
        "amount": Decimal(str(inp["amount"])),
        "original_amount": None,
        "original_currency_code": None,
        "exchange_rate": None,
    }


def _date_only(d: date) -> str:
    return d.isoformat()


def resolve_date_range(inp: dict, default_period: str = "this-month") -> dict:
    """Port of resolveDateRange — turns {period|from|to} into start/end date
    strings (YYYY-MM-DD) matching the TS analysis windows exactly."""
    now = datetime.now()
    today = now.date()

    def parse(v):
        if not isinstance(v, str) or not v.strip():
            return None
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00")).date()
        except ValueError:
            return None

    pf, pt = parse(inp.get("from")), parse(inp.get("to"))
    if pf or pt:
        frm = pf or pt or today
        to = pt or today
        start, end = (frm, to) if frm <= to else (to, frm)
        return {"start": _date_only(start), "end": _date_only(end), "label": "custom-range"}

    def month_start(d: date) -> date:
        return d.replace(day=1)

    def months_back(d: date, n: int) -> date:
        y, m = d.year, d.month - n
        while m <= 0:
            m += 12
            y -= 1
        return date(y, m, 1)

    def month_end(d: date) -> date:
        nxt = months_back(d.replace(day=1), -1) if False else None
        # last day of d's month
        if d.month == 12:
            return date(d.year, 12, 31)
        return date(d.year, d.month + 1, 1) - timedelta(days=1)

    period = str(inp.get("period") or default_period).lower()
    if period == "this-month":
        return {"start": _date_only(month_start(today)), "end": _date_only(today), "label": "this-month"}
    if period == "last-month":
        lm = months_back(today, 1)
        return {"start": _date_only(month_start(lm)), "end": _date_only(month_end(lm)), "label": "last-month"}
    if period in ("last-3-months", "3-months"):
        return {"start": _date_only(months_back(today, 2)), "end": _date_only(today), "label": "last-3-months"}
    if period in ("6-months", "last-6-months"):
        return {"start": _date_only(months_back(today, 5)), "end": _date_only(today), "label": "last-6-months"}
    if period in ("this-year", "year-to-date"):
        return {"start": _date_only(date(today.year, 1, 1)), "end": _date_only(today), "label": "this-year"}
    if period == "last-year":
        return {"start": _date_only(date(today.year - 1, 1, 1)), "end": _date_only(date(today.year - 1, 12, 31)), "label": "last-year"}
    # last-12-months / 1-year / default
    return {"start": _date_only(months_back(today, 11)), "end": _date_only(today), "label": "last-12-months"}
