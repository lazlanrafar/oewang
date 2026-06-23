import re

from app.core.database import fetchrow

# Mirrors packages/utils/currency.ts → formatCurrency (locale "en-US").
_DEFAULT = {
    "main_currency_code": "USD",
    "main_currency_symbol": "$",
    "main_currency_symbol_position": "Front",
    "main_currency_decimal_places": 2,
}


async def get_currency_settings(workspace_id: str) -> dict:
    row = await fetchrow(
        """
        SELECT main_currency_code, main_currency_symbol,
               main_currency_symbol_position, main_currency_decimal_places
        FROM workspace_settings
        WHERE workspace_id = $1 AND deleted_at IS NULL
        LIMIT 1
        """,
        workspace_id,
    )
    return dict(row) if row else dict(_DEFAULT)


def _display_unit(code: str | None, symbol: str | None) -> str:
    # getCurrencyDisplayUnit: prefer the uppercase code, else the symbol.
    return (code.upper() if code else None) or symbol or "$"


def format_currency(amount: float, settings: dict | None = None) -> str:
    s = settings or _DEFAULT
    code = s.get("main_currency_code")
    symbol = s.get("main_currency_symbol") or "$"
    position = s.get("main_currency_symbol_position") or "Front"
    decimals = s.get("main_currency_decimal_places")
    if decimals is None:
        decimals = 2

    unit = _display_unit(code, symbol)
    body = f"{abs(amount):,.{decimals}f}"  # en-US grouping, e.g. 1,500,000
    sign = "-" if amount < 0 else ""
    sep = " " if re.search(r"[A-Za-z]", unit) else ""  # spacing for alpha codes

    if position == "Front":
        return f"{sign}{unit}{sep}{body}"
    return f"{sign}{body}{sep}{unit}"
