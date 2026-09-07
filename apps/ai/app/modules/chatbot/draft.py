"""Receipt-draft short-circuit flow — port of ai.service.ts's getLatestDraftState,
buildInvoiceDraftFromAttachments, handlePendingInvoiceDraft,
confirmDraftAndCreateTransactions.

Draft state isn't a table — it's JSON stored in ai_messages.attachments.invoiceDraft
on the latest assistant message of a session (see get_latest_draft_state). asyncpg
returns jsonb columns as raw JSON text, not parsed objects — every read here goes
through parse_attachments.
"""

import asyncio
import base64
import json
import re
from datetime import datetime, timezone

from app.core import quota, sessions
from app.core.database import fetch
from app.core.vault import upload_receipt_attachment
from app.modules.execution.items import add_transaction_items
from app.modules.execution.transactions import create_transaction
from app.modules.receipt.service import parse_receipt
from app.utils.logger import get_logger

log = get_logger("ai.chatbot.draft")


async def _parse_receipt_metered(
    data_b64: str, mime_type: str, category_context: str, workspace_id: str
) -> dict | None:
    """In-process port of AiSidecarClient.parseReceipt — was an HTTP call to
    this same service's own /receipt/parse route; now a direct call, metered
    the same way (/receipt/parse: quota.check_quota before, record_usage after)."""
    await quota.check_quota(workspace_id)
    parsed, usage = await asyncio.to_thread(parse_receipt, data_b64, mime_type, category_context)
    await quota.record_usage(workspace_id, usage)
    return parsed

_RECEIPT_MIME_PREFIXES = ("image/",)


def parse_attachments(raw) -> dict | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            return None
    return raw


def is_receipt_attachment(a: dict) -> bool:
    t = a.get("type") or ""
    return t == "application/pdf" or t.startswith(_RECEIPT_MIME_PREFIXES)


def has_receipt_attachments(attachments: list[dict] | None) -> bool:
    return bool(attachments) and any(is_receipt_attachment(a) for a in attachments)


def to_valid_iso_date(value: str | None) -> str:
    if not value:
        return datetime.now(timezone.utc).isoformat()
    try:
        # Accept the common ISO shapes the LLM/receipt parser emit.
        v = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(v)
        return dt.isoformat()
    except ValueError:
        return datetime.now(timezone.utc).isoformat()


def format_amount(amount) -> str:
    n = int(round(float(amount or 0)))
    return f"{n:,}".replace(",", ".")


_CONFIRM_RE = re.compile(r"(^|\b)(confirm|confirmed|yes|ok|okay|save|simpan|ya|lanjut)(\b|$)", re.IGNORECASE)
_CANCEL_RE = re.compile(r"(^|\b)(cancel|batal|jangan|stop|abort)(\b|$)", re.IGNORECASE)
_WALLET_NAME_RE = re.compile(r"(?:account|wallet|akun)\s*[:=-]\s*([^\n]+)", re.IGNORECASE)


def is_confirm_intent(text: str) -> bool:
    return bool(_CONFIRM_RE.search((text or "").lower().strip()))


def is_cancel_intent(text: str) -> bool:
    return bool(_CANCEL_RE.search((text or "").lower().strip()))


def extract_requested_wallet_name(text: str, wallets: list[dict]) -> str | None:
    m = _WALLET_NAME_RE.search(text or "")
    if m:
        explicit = m.group(1).strip()
        if explicit:
            return explicit
    normalized = (text or "").lower()
    for w in wallets:
        if w["name"].lower() in normalized:
            return w["name"]
    return None


def resolve_wallet_by_name(wallets: list[dict], name: str | None) -> dict | None:
    if not name:
        return None
    lowered = name.lower()
    for w in wallets:
        if w["name"].lower() == lowered:
            return w
    for w in wallets:
        if lowered in w["name"].lower():
            return w
    for w in wallets:
        if w["name"].lower() in lowered:
            return w
    return None


def get_latest_draft_state(history: list[dict]) -> dict | None:
    for m in reversed(history):
        if not m or m.get("role") != "assistant":
            continue
        attachments = parse_attachments(m.get("attachments"))
        draft = (attachments or {}).get("invoiceDraft") if isinstance(attachments, dict) else None
        if draft:
            return draft
    return None


# ── Wallets / categories fetch (mirrors executor.py's _workspace_context pattern) ──


async def _list_wallets(workspace_id: str) -> list[dict]:
    rows = await fetch(
        "SELECT id, name, is_default FROM wallets "
        "WHERE workspace_id = $1 AND deleted_at IS NULL "
        "ORDER BY is_default DESC, sort_order ASC LIMIT 50",
        workspace_id,
    )
    return [{"id": r["id"], "name": r["name"], "isDefault": bool(r["is_default"])} for r in rows]


async def _expense_category_context(workspace_id: str) -> str:
    rows = await fetch(
        "SELECT id, name FROM categories WHERE workspace_id = $1 AND type = 'expense' "
        "AND deleted_at IS NULL",
        workspace_id,
    )
    return "\n".join(f"- {r['name']} (ID: {r['id']})" for r in rows)


# ── Build a draft from newly-uploaded receipt attachments ──────────────────────


async def build_invoice_draft_from_attachments(
    workspace_id: str, user_id: str, attachments: list[dict] | None
) -> dict | None:
    """Returns {"reply", "draft"} or None if there's nothing to build from."""
    if not attachments:
        return None
    receipt_attachments = [a for a in attachments if is_receipt_attachment(a)]
    if not receipt_attachments:
        return None

    wallets = await _list_wallets(workspace_id)
    default_wallet = next((w for w in wallets if w["isDefault"]), wallets[0] if wallets else None)

    if not default_wallet:
        empty_draft = {
            "status": "awaiting_confirmation",
            "createdAt": to_valid_iso_date(None),
            "wallets": wallets,
            "entries": [],
        }
        return {
            "reply": "I found receipt files, but no account is available yet. Please create an account first, then upload again.",
            "draft": empty_draft,
        }

    category_context = await _expense_category_context(workspace_id)

    entries: list[dict] = []
    failed_lines: list[str] = []

    for attachment in receipt_attachments:
        try:
            attachment_ids = None
            try:
                data = base64.b64decode(attachment["data"])
                vault_file_id = await upload_receipt_attachment(
                    workspace_id, attachment["name"], attachment["type"], data
                )
                attachment_ids = [vault_file_id] if vault_file_id else None
            except Exception as err:  # noqa: BLE001 — best-effort, never blocks the draft
                log.warning(
                    "Failed to upload chat attachment to vault: workspace=%s file=%s err=%s",
                    workspace_id,
                    attachment.get("name"),
                    err,
                )

            parsed = await _parse_receipt_metered(
                attachment["data"], attachment["type"], category_context, workspace_id
            )

            if not parsed or not parsed.get("amount"):
                failed_lines.append(f"{attachment['name']}: unable to read amount")
                continue

            items = [i for i in (parsed.get("items") or []) if i.get("name") and float(i.get("amount") or 0) > 0]
            entries.append(
                {
                    "fileName": attachment["name"],
                    "amount": float(parsed["amount"]),
                    "date": to_valid_iso_date(parsed.get("date")),
                    "name": parsed.get("name") or attachment["name"],
                    "categoryId": parsed.get("categoryId") or None,
                    "walletId": default_wallet["id"],
                    "attachmentIds": attachment_ids,
                    "items": [
                        {
                            "name": i["name"],
                            "brand": i.get("brand"),
                            "quantity": i.get("quantity"),
                            "unit": i.get("unit"),
                            "unitPrice": i.get("unitPrice"),
                            "amount": float(i["amount"]),
                            "categoryId": i.get("categoryId") or parsed.get("categoryId"),
                        }
                        for i in items
                    ],
                }
            )
        except Exception as err:  # noqa: BLE001
            failed_lines.append(f"{attachment.get('name')}: {err}")

    draft = {
        "status": "awaiting_confirmation",
        "createdAt": to_valid_iso_date(None),
        "wallets": wallets,
        "entries": entries,
    }

    if not entries:
        reply = "I could not read any receipt from the uploaded files."
        if failed_lines:
            reply += "\n" + "\n".join(f"- {l}" for l in failed_lines)
        return {"reply": reply, "draft": draft}

    wallet_by_id = {w["id"]: w["name"] for w in wallets}
    lines = ["I parsed your receipt — please confirm before I save."]
    for i, e in enumerate(entries):
        date_display = datetime.fromisoformat(e["date"]).strftime("%d/%m/%Y")
        lines.append(
            f"{i + 1}. {e['name']} — IDR {format_amount(e['amount'])} | {date_display} | "
            f"account: {wallet_by_id.get(e['walletId'], '-')}"
        )
    lines += ["", "To change account, reply: account: <account name>", "Then reply: confirm"]
    if failed_lines:
        lines += ["", "Skipped files:"] + [f"- {l}" for l in failed_lines]

    return {"reply": "\n".join(lines), "draft": draft}


# ── Confirm a draft → create transactions ───────────────────────────────────────


async def confirm_draft_and_create_transactions(
    workspace_id: str, user_id: str, draft: dict, wallet_override_id: str | None = None
) -> dict:
    created_lines: list[str] = []
    created_count = 0

    for entry in draft.get("entries", []):
        wallet_id = wallet_override_id or entry["walletId"]
        result = await create_transaction(
            workspace_id,
            user_id,
            {
                "wallet_id": wallet_id,
                "category_id": entry.get("categoryId") or None,
                "amount": entry["amount"],
                "date": to_valid_iso_date(entry["date"]),
                "type": "expense",
                "name": entry["name"],
                "description": f"Imported from chat receipt: {entry['fileName']}",
                "attachment_ids": entry.get("attachmentIds"),
            },
        )

        transaction_id = (result.get("data") or {}).get("id")
        items = entry.get("items") or []
        if transaction_id and items:
            await add_transaction_items(
                workspace_id,
                user_id,
                transaction_id,
                [
                    {
                        "name": i["name"],
                        "brand": i.get("brand"),
                        "quantity": i.get("quantity"),
                        "unit": i.get("unit"),
                        "unitPrice": i.get("unitPrice"),
                        "amount": i["amount"],
                        "categoryId": i.get("categoryId") or entry.get("categoryId"),
                        "notes": None,
                    }
                    for i in items
                ],
            )

        created_count += 1
        suffix = f" ({len(items)} items)" if items else ""
        created_lines.append(f"{entry['name']} — IDR {format_amount(entry['amount'])}{suffix}")

    reply_lines = [f"Saved {created_count} transaction{'s' if created_count != 1 else ''}."]
    reply_lines += [f"- {l}" for l in created_lines]
    return {"reply": "\n".join(reply_lines), "createdCount": created_count}


# ── Handle a reply while a draft is pending confirmation ────────────────────────


async def handle_pending_invoice_draft(
    workspace_id: str,
    user_id: str,
    latest_user_message: dict,
    draft: dict,
    current_session_id: str,
) -> dict | None:
    if draft.get("status") != "awaiting_confirmation":
        return None

    wallets = draft.get("wallets") or []
    content = latest_user_message.get("content") or ""
    requested_wallet_name = extract_requested_wallet_name(content, wallets)
    resolved_wallet = resolve_wallet_by_name(wallets, requested_wallet_name)
    confirm = is_confirm_intent(content)
    cancel = is_cancel_intent(content)

    async def _reply(text: str, updated_draft: dict) -> dict:
        await sessions.save_message(
            current_session_id, workspace_id, "assistant", text, {"invoiceDraft": updated_draft}
        )
        return {"sessionId": current_session_id, "reply": text}

    if cancel:
        cancelled_draft = {**draft, "status": "cancelled"}
        return await _reply("Cancelled. I did not save any transaction from this receipt.", cancelled_draft)

    if confirm:
        result = await confirm_draft_and_create_transactions(
            workspace_id, user_id, draft, resolved_wallet["id"] if resolved_wallet else None
        )
        confirmed_draft = {**draft, "status": "confirmed"}
        return await _reply(result["reply"], confirmed_draft)

    if requested_wallet_name and not resolved_wallet:
        options = "\n".join(f"- {w['name']}" for w in wallets) or "- (none)"
        reply = (
            f'I cannot find account "{requested_wallet_name}".\n'
            f"Available accounts:\n{options}\n\n"
            f"Reply with: account: <account name>"
        )
        return await _reply(reply, draft)

    if resolved_wallet:
        updated_draft = {
            **draft,
            "entries": [{**e, "walletId": resolved_wallet["id"]} for e in draft.get("entries", [])],
        }
        reply = f'Account updated to "{resolved_wallet["name"]}". Reply "confirm" to save this receipt.'
        return await _reply(reply, updated_draft)

    entries = draft.get("entries") or []
    current_wallet_id = entries[0]["walletId"] if entries else None
    current_wallet = next((w["name"] for w in wallets if w["id"] == current_wallet_id), "-")
    reply = f'Draft is ready. Current account: "{current_wallet}". Reply "confirm" to save, or "account: <name>" to change account.'
    return await _reply(reply, draft)
