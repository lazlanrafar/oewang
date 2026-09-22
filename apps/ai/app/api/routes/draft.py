"""Telegram-facing draft-flow endpoints — service-to-service (x-api-key only,
no JWT; applied at router level in main.py, same as /tools/execute and
/chat/run). Wraps modules/chatbot/draft.py so Telegram's webhook handler
(apps/api) doesn't need to duplicate this logic in TS.
"""

from fastapi import APIRouter, HTTPException
from app.modules.chatbot.chat_money_path import chat_begin_core, SessionNotFoundError

from app.modules.chatbot import draft
from app.schemas.draft import (
    BuildFromAttachmentsRequest,
    HandlePendingRequest,
    LatestStateRequest,
)

router = APIRouter(tags=["draft"])


@router.post("/draft/latest-state")
async def post_latest_state(req: LatestStateRequest) -> dict:
    return {"draft": draft.get_latest_draft_state(req.history)}


@router.post("/draft/handle-pending")
async def post_handle_pending(req: HandlePendingRequest) -> dict:
    # Client draft JSON is not authoritative: reload it from the owned session.
    return await _begin(req.workspace_id, req.user_id, req.message.model_dump(), req.session_id, req.personal_memory)


async def _begin(workspace_id: str, user_id: str, message: dict, session_id: str | None, personal: bool) -> dict:
    try:
        result = await chat_begin_core(workspace_id, user_id, [message], session_id, personal_memory=personal)
    except SessionNotFoundError as error:
        raise HTTPException(404, str(error)) from error
    if result["kind"] != "early":
        return {"result": None}
    return {"result": {"reply": result["reply"], "session_id": result["sessionId"]}}


@router.post("/draft/build-from-attachments")
async def post_build_from_attachments(req: BuildFromAttachmentsRequest) -> dict:
    return await _begin(req.workspace_id, req.user_id,
        {"role": "user", "content": req.caption, "attachments": req.attachments}, req.session_id, req.personal_memory)
