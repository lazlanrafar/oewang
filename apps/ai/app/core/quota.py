"""AI token quota — mirrors apps/api/modules/ai/ai.repository.ts.

maxTokens = plan.max_ai_tokens + workspaces.extra_ai_tokens + sum(active AI addons).
Free plans reset monthly off ai_tokens_reset_at. The 422 PLAN_LIMIT_REACHED shape
(with reset_at) is preserved so the browser sees the same error as the TS path.
"""

import calendar
from dataclasses import dataclass
from datetime import datetime, timezone

from app.config import get_settings
from app.core.database import execute, fetchrow


def _add_monthly_reset(base: datetime) -> datetime:
    """Calendar-month reset with day-of-month clamping — port of TS's
    addMonthlyReset (ai.service.ts), not a flat 30-day window. e.g. Jan 31 + 1
    month → Feb 28/29, clamped to the target month's last day."""
    day = base.day
    year = base.year + (1 if base.month == 12 else 0)
    month = 1 if base.month == 12 else base.month + 1
    last_day = calendar.monthrange(year, month)[1]
    return base.replace(year=year, month=month, day=min(day, last_day))


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
    carry into increment_ai_tokens. Honors a free-plan monthly reset (calendar
    month, day-of-month clamped — matches TS's addMonthlyReset, not a flat
    30-day window), the MOCK_AI_QUOTA dev bypass, and AI_QUOTA_EXEMPT_WORKSPACE_IDS.
    Raises PlanLimitReached (→ 422) when over."""
    q = await get_usage_and_quota(workspace_id)
    if q is None:
        return 0

    used = q.used
    # Free plan: roll the window over once a calendar month has elapsed since
    # the reset mark (mirrors ai.service.ts's inline chatBegin logic, which
    # every chat now routes through via this shared module).
    if q.plan_status == "free" and q.ai_tokens_reset_at is not None:
        now = datetime.now(timezone.utc)
        reset_mark = q.ai_tokens_reset_at
        if reset_mark.tzinfo is None:
            reset_mark = reset_mark.replace(tzinfo=timezone.utc)
        next_reset = _add_monthly_reset(reset_mark)
        if now >= next_reset:
            await execute(
                "UPDATE workspaces SET ai_tokens_used = 0, ai_tokens_reset_at = $2, "
                "updated_at = now() WHERE id = $1",
                workspace_id,
                now,
            )
            return 0

    if get_settings().MOCK_AI_QUOTA:
        return used

    # Unset/zero plan limit defaults to 50 (matches ai.service.ts) rather than
    # being treated as unlimited.
    max_tokens = q.max_tokens if q.max_tokens and q.max_tokens > 0 else 50

    if (
        max_tokens > 0
        and used >= max_tokens
        and workspace_id not in get_settings().AI_QUOTA_EXEMPT_WORKSPACE_IDS
    ):
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
