"""AI token quota gate + meter — must fail closed when over limit."""

from datetime import datetime, timezone

import pytest

import app.core.quota as quota
from app.core.quota import Quota


def _q(used: int, max_tokens: int) -> Quota:
    return Quota(
        used=used,
        max_tokens=max_tokens,
        plan_status="pro",
        ai_tokens_reset_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        created_at=None,
    )


async def test_check_quota_raises_when_over_limit(monkeypatch):
    async def usage(_ws):
        return _q(used=1000, max_tokens=1000)

    monkeypatch.setattr(quota, "get_usage_and_quota", usage)
    with pytest.raises(quota.PlanLimitReached) as ei:
        await quota.check_quota("w1")
    assert ei.value.reset_at is not None


async def test_check_quota_returns_used_when_under_limit(monkeypatch):
    async def usage(_ws):
        return _q(used=200, max_tokens=1000)

    monkeypatch.setattr(quota, "get_usage_and_quota", usage)
    assert await quota.check_quota("w1") == 200


async def test_record_usage_increments_by_total_tokens(monkeypatch):
    captured = {}

    async def fake_execute(sql, ws, spent):
        captured["sql"] = sql
        captured["ws"] = ws
        captured["spent"] = spent

    monkeypatch.setattr(quota, "execute", fake_execute)
    await quota.record_usage("w1", {"input_tokens": 30, "output_tokens": 70})
    assert captured["ws"] == "w1"
    assert captured["spent"] == 100
    # Must be an atomic in-database increment, not app-computed.
    assert "ai_tokens_used + $2" in captured["sql"]
