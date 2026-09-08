"""Internal endpoints called by the Go worker (apps/worker) for jobs whose
scheduling now lives in Go but whose actual logic stays here — the same
"don't port business logic to Go" rule the TS side follows. Auth via
x-api-key (applied in main.py), same trust model as every other router here.
"""

from collections.abc import AsyncGenerator
from datetime import datetime, timezone
import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core import quota
from app.core.database import execute, fetch
from app.modules.anomaly.service import scan_all_workspaces
from app.modules.chatbot.chat_money_path import SessionNotFoundError
from app.modules.chatbot.service import stream_service_chat
from app.schemas.chatbot import ChatRequest

router = APIRouter(tags=["internal"])


@router.post("/internal/quota/reset-all")
async def post_quota_reset_all() -> dict:
    """Bulk version of the lazy reset check.check_quota does inline for one
    workspace on its next chat call. The Go worker calls this on a daily
    cadence so a workspace's quota resets even if nobody chats right after
    the mark passes. Reuses quota._add_monthly_reset (calendar-month,
    day-clamped) unchanged — do not reimplement the date math here."""
    rows = await fetch(
        "SELECT id, ai_tokens_reset_at FROM workspaces "
        "WHERE plan_status = 'free' AND ai_tokens_reset_at IS NOT NULL "
        "AND deleted_at IS NULL"
    )
    now = datetime.now(timezone.utc)
    reset_count = 0
    for row in rows:
        reset_mark = row["ai_tokens_reset_at"]
        if reset_mark.tzinfo is None:
            reset_mark = reset_mark.replace(tzinfo=timezone.utc)
        next_reset = quota._add_monthly_reset(reset_mark)
        if now >= next_reset:
            await execute(
                "UPDATE workspaces SET ai_tokens_used = 0, ai_tokens_reset_at = $2, "
                "updated_at = now() WHERE id = $1",
                row["id"],
                now,
            )
            reset_count += 1
    return {"reset_count": reset_count}


@router.post("/internal/anomaly/scan-all")
async def post_anomaly_scan_all() -> dict:
    """Thin wrapper over scan_all_workspaces — the Go worker's periodic task
    replaces the old in-process AsyncIOScheduler job that used to call this
    directly (removed from main.py's lifespan)."""
    result = await scan_all_workspaces()
    return result if isinstance(result, dict) else {"ok": True}


@router.post("/internal/chat/stream")
async def post_internal_chat_stream(req: ChatRequest):
    """Streaming tool-loop chat for the Telegram bot: same SSE shape as
    /chat/web/stream (content deltas + a final done event with reply/usage/
    artifacts), but keyed by workspace_id/user_id from the trusted x-api-key
    caller instead of a browser JWT. /chat/stream is the legacy no-tool-loop
    path — do not point Telegram at that one."""
    if not req.user_id:
        err_data = json.dumps({"error": "user_id is required"})
        return StreamingResponse(
            iter([f"event: error\ndata: {err_data}\n\n"]),
            media_type="text/event-stream",
        )
    user_id: str = req.user_id

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            async for event in stream_service_chat(
                req.workspace_id, user_id, req.message, req.session_id
            ):
                event_name = event.get("event", "message")
                data_str = json.dumps(event.get("data", {}))
                yield f"event: {event_name}\ndata: {data_str}\n\n"
        except quota.PlanLimitReached as e:
            err_data = json.dumps({"error": "PLAN_LIMIT_REACHED", "reset_at": e.reset_at})
            yield f"event: error\ndata: {err_data}\n\n"
        except SessionNotFoundError as e:
            err_data = json.dumps({"error": str(e)})
            yield f"event: error\ndata: {err_data}\n\n"
        except Exception as e:
            err_data = json.dumps({"error": str(e)})
            yield f"event: error\ndata: {err_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
