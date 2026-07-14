"""AI token quota — mirrors apps/api/modules/ai/ai.repository.ts.

maxTokens = plan.max_ai_tokens + workspaces.extra_ai_tokens + sum(active AI addons).
Free plans reset monthly off ai_tokens_reset_at. The 422 PLAN_LIMIT_REACHED shape
(with reset_at) is preserved so the browser sees the same error as the TS path.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.config import get_settings
from app.core.database import execute, fetchrow


class PlanLimitReached(Exception):
    def __init__(self, reset_at: str | None):
        self.reset_at = reset_at
        super().__init__("PLAN_LIMIT_REACHED")


@dataclass
class Quota:
    used: int
    max_tokens: int
    plan_status: str
    ai_tokens_reset_at: datetime | None
    created_at: datetime | None


async def get_usage_and_quota(workspace_id: str) -> Quota | None:
    row = await fetchrow(
        """
        SELECT w.ai_tokens_used        AS used,
               w.extra_ai_tokens       AS extra,
               p.max_ai_tokens         AS max_tokens,
               w.plan_status           AS plan_status,
               w.ai_tokens_reset_at    AS ai_tokens_reset_at,
               w.created_at            AS created_at
        FROM workspaces w
        LEFT JOIN pricing p ON w.plan_id = p.id
        WHERE w.id = $1
        LIMIT 1
        """,
        workspace_id,
    )
    if row is None:
        return None

    addon = await fetchrow(
        """
        SELECT COALESCE(SUM(p.max_ai_tokens), 0) AS extra
        FROM workspace_addons wa
        JOIN pricing p ON wa.addon_id = p.id
        WHERE wa.workspace_id = $1
          AND wa.status = 'active'
          AND p.addon_type = 'ai'
          AND wa.deleted_at IS NULL
        """,
        workspace_id,
    )
    recurring_extra = int(addon["extra"]) if addon else 0
    max_tokens = int(row["max_tokens"] or 0) + int(row["extra"] or 0) + recurring_extra

    return Quota(
        used=int(row["used"] or 0),
        max_tokens=max_tokens,
        plan_status=row["plan_status"],
        ai_tokens_reset_at=row["ai_tokens_reset_at"],
        created_at=row["created_at"],
    )


async def check_quota(workspace_id: str) -> int:
    """Enforce the limit before an LLM call; returns the current token count to
    carry into increment_ai_tokens. Honors a free-plan monthly reset and the
    MOCK_AI_QUOTA dev bypass. Raises PlanLimitReached (→ 422) when over."""
    q = await get_usage_and_quota(workspace_id)
    if q is None:
        return 0

    used = q.used
    # Free plan: roll the window over once a month has elapsed since the reset mark.
    if q.plan_status == "free" and q.ai_tokens_reset_at is not None:
        now = datetime.now(timezone.utc)
        reset_mark = q.ai_tokens_reset_at
        if reset_mark.tzinfo is None:
            reset_mark = reset_mark.replace(tzinfo=timezone.utc)
        if now - reset_mark >= timedelta(days=30):
            await execute(
                "UPDATE workspaces SET ai_tokens_used = 0, ai_tokens_reset_at = $2, "
                "updated_at = now() WHERE id = $1",
                workspace_id,
                now,
            )
            return 0

    if get_settings().MOCK_AI_QUOTA:
        return used

    if used >= q.max_tokens:
        reset = q.ai_tokens_reset_at.isoformat() if q.ai_tokens_reset_at else None
        raise PlanLimitReached(reset)
    return used


async def increment_ai_tokens(workspace_id: str, tokens_spent: int) -> None:
    # Atomic increment — computing the sum in app code loses updates when two
    # chats in the same workspace finish concurrently.
    await execute(
        "UPDATE workspaces SET ai_tokens_used = ai_tokens_used + $2, "
        "updated_at = now() WHERE id = $1",
        workspace_id,
        tokens_spent,
    )


async def record_usage(workspace_id: str, usage: dict) -> None:
    """Add an LLM call's token spend to the workspace counter."""
    spent = int(usage.get("input_tokens", 0)) + int(usage.get("output_tokens", 0))
    if spent:
        await increment_ai_tokens(workspace_id, spent)
