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


def _free_q(used: int, max_tokens: int, reset_at: datetime) -> Quota:
    return Quota(
        used=used, max_tokens=max_tokens, plan_status="free",
        ai_tokens_reset_at=reset_at, created_at=None,
    )


async def test_check_quota_calendar_month_reset_not_yet_due(monkeypatch):
    # Jan 15 + calendar month = Feb 15 — "now" just before that must NOT reset.
    reset_at = datetime(2026, 1, 15, tzinfo=timezone.utc)

    async def usage(_ws):
        return _free_q(500, 1000, reset_at)

    monkeypatch.setattr(quota, "get_usage_and_quota", usage)
    called = {"execute": False}

    async def fake_execute(*a, **k):
        called["execute"] = True

    monkeypatch.setattr(quota, "execute", fake_execute)

    class _FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 2, 10, tzinfo=timezone.utc)

    monkeypatch.setattr(quota, "datetime", _FrozenDatetime)
    assert await quota.check_quota("w1") == 500
    assert called["execute"] is False


async def test_check_quota_calendar_month_reset_due(monkeypatch):
    # Jan 31 + calendar month, clamped to Feb's last day (28 in 2026) — "now"
    # on/after Feb 28 must reset, unlike a flat 30-day window (which would
    # already have rolled over by Mar 2, one day off from the calendar rule).
    reset_at = datetime(2026, 1, 31, tzinfo=timezone.utc)

    async def usage(_ws):
        return _free_q(500, 1000, reset_at)

    monkeypatch.setattr(quota, "get_usage_and_quota", usage)
    captured = {}

    async def fake_execute(sql, ws, now):
        captured["ws"] = ws

    monkeypatch.setattr(quota, "execute", fake_execute)

    class _FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 2, 28, tzinfo=timezone.utc)

    monkeypatch.setattr(quota, "datetime", _FrozenDatetime)
    assert await quota.check_quota("w1") == 0
    assert captured["ws"] == "w1"


async def test_check_quota_defaults_unset_max_tokens_to_50(monkeypatch):
    async def usage(_ws):
        return _q(used=0, max_tokens=0)

    monkeypatch.setattr(quota, "get_usage_and_quota", usage)
    # 0 used, defaulted max of 50 — must not raise (0 < 50).
    assert await quota.check_quota("w1") == 0


async def test_check_quota_over_zero_max_tokens_raises_using_default_50(monkeypatch):
    async def usage(_ws):
        return _q(used=50, max_tokens=0)

    monkeypatch.setattr(quota, "get_usage_and_quota", usage)
    with pytest.raises(quota.PlanLimitReached):
        await quota.check_quota("w1")


async def test_check_quota_exempt_workspace_bypasses_enforcement(monkeypatch):
    from app.config import get_settings

    async def usage(_ws):
        return _q(used=1000, max_tokens=1000)

    get_settings().AI_QUOTA_EXEMPT_WORKSPACE_IDS = ["exempt-ws"]
    monkeypatch.setattr(quota, "get_usage_and_quota", usage)
    assert await quota.check_quota("exempt-ws") == 1000
    get_settings().AI_QUOTA_EXEMPT_WORKSPACE_IDS = []
