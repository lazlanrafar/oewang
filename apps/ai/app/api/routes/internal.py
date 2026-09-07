"""Internal endpoints called by the Go worker (apps/worker) for jobs whose
scheduling now lives in Go but whose actual logic stays here — the same
"don't port business logic to Go" rule the TS side follows. Auth via
x-api-key (applied in main.py), same trust model as every other router here.
"""

from datetime import datetime, timezone

from fastapi import APIRouter

from app.core import quota
from app.core.database import execute, fetch
from app.modules.anomaly.service import scan_all_workspaces

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
