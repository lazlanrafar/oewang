"""Bulk quota reset — the Go worker's daily replacement for the per-chat lazy
reset check_quota does inline for a single workspace on its next call."""

from datetime import datetime, timezone

import app.api.routes.internal as internal_routes


def _row(id_: str, reset_at: datetime) -> dict:
    return {"id": id_, "ai_tokens_reset_at": reset_at}


class _FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return datetime(2026, 3, 1, tzinfo=timezone.utc)


async def test_reset_all_resets_only_workspaces_past_their_mark(monkeypatch):
    # Jan 15 + calendar month = Feb 15 — already due by "now" (Mar 1).
    past_mark = datetime(2026, 1, 15, tzinfo=timezone.utc)
    # Feb 20 + calendar month = Mar 20 — not yet due by "now" (Mar 1).
    not_due_mark = datetime(2026, 2, 20, tzinfo=timezone.utc)

    rows = [_row("ws-past", past_mark), _row("ws-not-due", not_due_mark)]
    updated = []

    async def fake_fetch(query, *args):
        return rows

    async def fake_execute(query, ws_id, now):
        updated.append(ws_id)

    monkeypatch.setattr(internal_routes, "fetch", fake_fetch)
    monkeypatch.setattr(internal_routes, "execute", fake_execute)
    monkeypatch.setattr(internal_routes, "datetime", _FrozenDatetime)

    result = await internal_routes.post_quota_reset_all()

    assert result == {"reset_count": 1}
    assert updated == ["ws-past"]


async def test_reset_all_leaves_workspaces_not_yet_due_untouched(monkeypatch):
    not_due_mark = datetime(2026, 2, 20, tzinfo=timezone.utc)

    async def fake_fetch(query, *args):
        return [_row("ws-not-due", not_due_mark)]

    async def fake_execute(*args):
        raise AssertionError("must not reset a workspace not yet past its mark")

    monkeypatch.setattr(internal_routes, "fetch", fake_fetch)
    monkeypatch.setattr(internal_routes, "execute", fake_execute)
    monkeypatch.setattr(internal_routes, "datetime", _FrozenDatetime)

    result = await internal_routes.post_quota_reset_all()

    assert result == {"reset_count": 0}


async def test_reset_all_queries_only_free_plans_not_deleted(monkeypatch):
    captured = {}

    async def fake_fetch(query, *args):
        captured["query"] = query
        return []

    monkeypatch.setattr(internal_routes, "fetch", fake_fetch)
    monkeypatch.setattr(internal_routes, "datetime", _FrozenDatetime)

    await internal_routes.post_quota_reset_all()

    assert "plan_status = 'free'" in captured["query"]
    assert "deleted_at IS NULL" in captured["query"]
