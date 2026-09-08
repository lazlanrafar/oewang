"""export_transactions_csv — builds a CSV of the workspace's transactions for
a date range and uploads it to the vault as a chat attachment (see
executor.py's file-attachment artifact rule)."""

import csv
import io

from app.core.database import fetch
from app.core.vault import upload_receipt_attachment
from app.modules.execution.resolvers import resolve_date_range


def _rows_to_csv(rows: list[dict]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Date", "Type", "Name", "Category", "Wallet", "Amount"])
    for r in rows:
        writer.writerow([r["date"], r["type"], r["name"], r["category_name"], r["wallet_name"], r["amount"]])
    return buf.getvalue()


async def export_transactions_csv(workspace_id: str, inp: dict) -> dict:
    date_range = resolve_date_range(inp, "this-month")
    rows = await fetch(
        """
        SELECT t.date, t.type, t.name, t.amount,
               c.name AS category_name, w.name AS wallet_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN wallets w ON t.wallet_id = w.id
        WHERE t.workspace_id = $1 AND t.deleted_at IS NULL
          AND t.date >= $2::date AND t.date < ($3::date + 1)
        ORDER BY t.date DESC
        """,
        workspace_id,
        date_range["start"],
        date_range["end"],
    )
    rows = [dict(r) for r in rows]
    csv_text = _rows_to_csv(rows)

    file_name = f"transactions-{date_range['start']}-to-{date_range['end']}.csv"
    vault_file_id = await upload_receipt_attachment(
        workspace_id, file_name, "text/csv", csv_text.encode("utf-8")
    )
    if vault_file_id is None:
        return {"success": False, "error": "Could not generate export (storage quota reached)."}

    return {
        "success": True,
        "data": {"vault_file_id": vault_file_id, "name": file_name, "count": len(rows)},
    }
