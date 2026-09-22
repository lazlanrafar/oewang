"""Web chat's pre/post-LLM money path — port of AiService.chatBegin/chatEnd
(apps/api/modules/ai/ai.service.ts). Runs entirely in-process against Postgres;
no TS round trip. Session mgmt, the receipt-draft short-circuit, quota
enforcement, and system-prompt build all happen here; the LLM tool loop
(unchanged, already Python) runs around this in service.py.
"""

import asyncio

from app.core import agent_settings as agent_settings_mod
from app.core import audit, quota, sessions, user_memory
from app.core.database import fetchrow
from app.modules.chatbot import draft, prompts_web, memory_controls
from app.modules.execution.executor import fetch_wallets_and_categories
from app.utils.logger import get_logger

from app.modules.chatbot.language import detect_language, resolve_language

log = get_logger("ai.chatbot.chat_money_path")

_NOTIFY_TIMEOUT = 5.0


class SessionNotFoundError(Exception):
    pass


def _derive_title(first_message: str) -> str:
    clean = " ".join((first_message or "").split()).strip()
    if len(clean) > 60:
        return f"{clean[:57]}…"
    return clean or "New chat"


async def _upgrade_title(first_message: str, workspace_id: str, session_id: str, user_id: str) -> None:
    """Cosmetic async title upgrade — fires after chat_begin_core returns,
    never blocks the reply. Mirrors ai.service.ts's .then().catch() pattern."""
    try:
        from app.modules.chatbot.service import generate_title

        smart_title = await generate_title(first_message, workspace_id)
        if not smart_title:
            return
        await sessions.update_title(session_id, workspace_id, smart_title, user_id)
        await _notify_usage(workspace_id, "ai.session_title")
    except Exception:  # noqa: BLE001 — cosmetic, never surfaces to the user
        log.warning("Session title generation failed", exc_info=True)


async def _notify_usage(workspace_id: str, event_type: str) -> None:
    """Fire-and-forget call to apps/api's /ai/internal/notify-usage — Python
    can't reach RealtimeService directly (in-process EventEmitter, no Redis)."""
    import httpx

    from app.config import get_settings

    settings = get_settings()
    headers = {"content-type": "application/json"}
    if settings.AI_SERVICE_API_KEY:
        headers["x-api-key"] = settings.AI_SERVICE_API_KEY
    try:
        async with httpx.AsyncClient(timeout=_NOTIFY_TIMEOUT) as client:
            await client.post(
                f"{settings.API_INTERNAL_URL}/v1/ai/internal/notify-usage",
                headers=headers,
                json={"workspace_id": workspace_id, "type": event_type},
            )
    except Exception:  # noqa: BLE001 — best-effort; a missed live-update is not fatal
        log.warning("notify-usage failed for workspace=%s type=%s", workspace_id, event_type, exc_info=True)


async def _workspace_currency(workspace_id: str) -> tuple[str, str]:
    try:
        row = await fetchrow(
            "SELECT main_currency_code, main_currency_symbol FROM workspace_settings "
            "WHERE workspace_id = $1 AND deleted_at IS NULL LIMIT 1",
            workspace_id,
        )
        if row:
            return row["main_currency_code"] or "IDR", row["main_currency_symbol"] or "Rp"
    except Exception:  # noqa: BLE001 — swallowed, matches ai.service.ts's try/catch default
        log.warning("Currency lookup failed for workspace=%s", workspace_id, exc_info=True)
    return "IDR", "Rp"


async def chat_begin_core(
    workspace_id: str, user_id: str, messages: list[dict], session_id: str | None = None, *, personal_memory: bool = True
) -> dict:
    if not messages:
        raise ValueError("No messages provided")
    latest_user_message = messages[-1]

    if latest_user_message.get("role") != "user":
        raise ValueError("The latest message must be from the user")
    session = None
    if session_id:
        session = await sessions.get_session(session_id, workspace_id, user_id)
        if session is None or (session.get("user_id") and bool(session.get("personal_memory")) != personal_memory):
            raise SessionNotFoundError("Chat session not found or access denied.")
    # Legacy sessions are shared archives. Continue in a fresh private session;
    # never import client-supplied history or infer memories from the archive.
    if not session or not session.get("user_id"):
        session = await sessions.create_session(workspace_id, _derive_title(latest_user_message["content"]),
                                                user_id, personal_memory=personal_memory)
        asyncio.create_task(_upgrade_title(latest_user_message["content"], workspace_id, session["id"], user_id))
        await audit.log(workspace_id=workspace_id, user_id=user_id, action="ai.session_created",
                        entity="ai_session", entity_id=session["id"], after={"private": True})
    current_session_id = session["id"]
    context = draft.parse_attachments(session.get("context")) or {}
    agent_settings, memory, workspace_snapshot = await asyncio.gather(
        agent_settings_mod.get_or_create(workspace_id),
        user_memory.load(workspace_id, user_id, personal=personal_memory),
        fetch_wallets_and_categories(workspace_id),
    )
    names = [w["name"] for w in workspace_snapshot["wallets"]]
    language = resolve_language(latest_user_message["content"], context.get("language"),
        user_memory.value_for(memory, "language"), agent_settings.get("response_language"), names)
    context["language"] = language
    control = await memory_controls.handle(workspace_id, user_id, latest_user_message["content"],
        context, memory, language, personal=personal_memory)
    if control is None and memory.get("enabled") and detect_language(latest_user_message["content"], names):
        try:
            await user_memory.remember(workspace_id, user_id, "language", "language", language, source="inferred")
        except Exception:
            log.warning("Could not persist conversation language", exc_info=True)
    await sessions.update_context(current_session_id, workspace_id, user_id, context)

    await sessions.save_message(
        current_session_id,
        workspace_id,
        latest_user_message["role"],
        latest_user_message["content"],
        latest_user_message.get("attachments"),
    )

    if control is not None:
        await sessions.save_message(current_session_id, workspace_id, "assistant", control)
        return {"kind": "early", "sessionId": current_session_id, "reply": control}

    history = await sessions.get_session_messages(current_session_id, workspace_id, user_id)

    # Receipt-draft short-circuit, part 1: a pending draft awaiting the user's
    # confirm/cancel/wallet-select reply.
    latest_draft = draft.get_latest_draft_state(history)
    if latest_draft:
        latest_draft["language"] = language
        draft_response = await draft.handle_pending_invoice_draft(
            workspace_id, user_id, latest_user_message, latest_draft, current_session_id
        )
        if draft_response:
            return {"kind": "early", "sessionId": current_session_id, "reply": draft_response["reply"]}

    # Receipt-draft short-circuit, part 2: new receipt attachments to preview —
    # unless the user's message signals "this isn't a receipt" (is_document_upload_intent),
    # in which case it falls through to the general vault-save branch below.
    message_attachments = latest_user_message.get("attachments")
    is_receipt_upload = draft.has_receipt_attachments(message_attachments) and not draft.is_document_upload_intent(
        latest_user_message.get("content") or ""
    )
    if is_receipt_upload:
        preview = await draft.build_invoice_draft_from_attachments(
            workspace_id, user_id, message_attachments, language=language
        )
        if preview:
            await sessions.save_message(
                current_session_id,
                workspace_id,
                "assistant",
                preview["reply"],
                {"invoiceDraft": preview["draft"]},
            )
            return {"kind": "early", "sessionId": current_session_id, "reply": preview["reply"]}

    # Receipt-draft short-circuit, part 3: any other attachment (a non-receipt
    # mime type, or an image/PDF the user explicitly flagged as "not a
    # receipt") gets saved to the vault directly — no OCR, no draft.
    elif message_attachments:
        upload = await draft.build_vault_upload_from_attachments(
            workspace_id, user_id, message_attachments, language=language
        )
        if upload:
            await sessions.save_message(
                current_session_id, workspace_id, "assistant", upload["reply"]
            )
            return {"kind": "early", "sessionId": current_session_id, "reply": upload["reply"]}

    # None of these four depend on each other or on anything above — fetched
    # together instead of one-after-another. Also means a draft-continuation
    # turn (which returns early above) never pays for fetches it doesn't use.
    current_tokens, (currency_code, currency_symbol) = await asyncio.gather(
        quota.check_quota(workspace_id), _workspace_currency(workspace_id))
    system_prompt = prompts_web.build_system_prompt(
        currency_code,
        currency_symbol,
        custom_instructions=agent_settings.get("custom_instructions"),
        response_language="indonesian" if language == "id" else "english",
        wallets=workspace_snapshot["wallets"],
        categories=workspace_snapshot["categories"],
    )

    system_prompt += user_memory.prompt_context(memory)

    consolidated_history = [
        {"role": m["role"], "content": m["content"], "attachments": draft.parse_attachments(m.get("attachments"))}
        for m in history
    ]

    return {
        "kind": "ready",
        "sessionId": current_session_id,
        "systemPrompt": system_prompt,
        "history": consolidated_history,
        "currentTokens": current_tokens,
        "personal_memory": personal_memory,
        "memory_evidence": latest_user_message["content"],
    }


async def chat_end_core(
    workspace_id: str,
    session_id: str,
    reply: str,
    usage: dict | None = None,
    artifacts: list | None = None,
    provider: dict | None = None,
) -> None:
    attachments = None
    if artifacts or provider:
        attachments = {}
        if artifacts:
            attachments["artifacts"] = artifacts
        if provider:
            attachments["provider"] = provider

    await sessions.save_message(session_id, workspace_id, "assistant", reply, attachments)

    usage = usage or {}
    tokens_spent = int(usage.get("input_tokens") or 0) + int(usage.get("output_tokens") or 0)
    if tokens_spent:
        await quota.increment_ai_tokens(workspace_id, tokens_spent)
        await _notify_usage(workspace_id, "workspace.usage")
