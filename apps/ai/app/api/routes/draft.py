"""Telegram-facing draft-flow endpoints — service-to-service (x-api-key only,
no JWT; applied at router level in main.py, same as /tools/execute and
/chat/run). Wraps modules/chatbot/draft.py so Telegram's webhook handler
(apps/api) doesn't need to duplicate this logic in TS.
"""

from fastapi import APIRouter

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
    result = await draft.handle_pending_invoice_draft(
        req.workspace_id,
        req.user_id,
        req.message.model_dump(),
        req.draft,
        req.session_id,
    )
    return {"result": result}


@router.post("/draft/build-from-attachments")
async def post_build_from_attachments(req: BuildFromAttachmentsRequest) -> dict:
    result = await draft.build_invoice_draft_from_attachments(
        req.workspace_id, req.user_id, req.attachments
    )
    return {"result": result}
