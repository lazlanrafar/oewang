"""Thin wrapper route over scan_all_workspaces — the Go worker's periodic
anomaly-scan replacement for the removed in-process AsyncIOScheduler job."""

import app.api.routes.internal as internal_routes


async def test_scan_all_calls_scan_all_workspaces_and_returns_its_result(monkeypatch):
    calls = []

    async def fake_scan():
        calls.append(True)
        return {"scanned": 3}

    monkeypatch.setattr(internal_routes, "scan_all_workspaces", fake_scan)

    result = await internal_routes.post_anomaly_scan_all()

    assert calls == [True]
    assert result == {"scanned": 3}


async def test_scan_all_falls_back_to_ok_true_when_scan_returns_nothing(monkeypatch):
    async def fake_scan():
        return None

    monkeypatch.setattr(internal_routes, "scan_all_workspaces", fake_scan)

    result = await internal_routes.post_anomaly_scan_all()

    assert result == {"ok": True}
