"""JSON-friendly conversion for asyncpg rows. Decimal→float, datetime→ISO, so tool
results can be returned to the LLM and audit before/after can be json.dumps'd."""

from datetime import date, datetime
from decimal import Decimal


def to_jsonable(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    return obj


def row_to_dict(record) -> dict | None:
    return to_jsonable(dict(record)) if record is not None else None
