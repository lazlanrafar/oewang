"""System-bucket-only receipt-image upload — port of VaultService.uploadFile's
quota check, SHA-256 dedup, and vault_files row insert. Best-effort by
contract: callers (draft.py) swallow exceptions from this module and continue.
"""

import app.core.vault as vault_mod


async def test_upload_returns_none_when_workspace_missing(monkeypatch):
    async def fake_usage(_ws):
        return None

    monkeypatch.setattr(vault_mod, "_get_usage_and_quota", fake_usage)
    result = await vault_mod.upload_receipt_attachment("missing-ws", "r.png", "image/png", b"data")
    assert result is None


async def test_upload_returns_none_when_over_quota(monkeypatch):
    async def fake_usage(_ws):
        return {"used": 99 * 1024 * 1024, "max_mb": 100}

    async def fake_fingerprint(*a, **k):
        return None

    monkeypatch.setattr(vault_mod, "_get_usage_and_quota", fake_usage)
    monkeypatch.setattr(vault_mod, "_find_existing_by_fingerprint", fake_fingerprint)
    big = b"x" * (2 * 1024 * 1024)  # pushes used + additional past the 100MB cap
    result = await vault_mod.upload_receipt_attachment("ws1", "r.png", "image/png", big)
    assert result is None


async def test_upload_deduplicated_file_skips_put_and_size_increment(monkeypatch):
    put_calls = []
    execute_calls = []

    async def fake_usage(_ws):
        return {"used": 0, "max_mb": 100}

    async def fake_fingerprint(*a, **k):
        return {"id": "existing-vf", "key": "vault/ws1/existing-key.png"}

    async def fake_fetchrow(query, *args):
        return {"id": "existing-vf", "key": "vault/ws1/existing-key.png"}

    async def fake_execute(*a, **k):
        execute_calls.append(a)

    class FakeClient:
        def put_object(self, **kwargs):
            put_calls.append(kwargs)

    monkeypatch.setattr(vault_mod, "_get_usage_and_quota", fake_usage)
    monkeypatch.setattr(vault_mod, "_find_existing_by_fingerprint", fake_fingerprint)
    monkeypatch.setattr(vault_mod, "fetchrow", fake_fetchrow)
    monkeypatch.setattr(vault_mod, "execute", fake_execute)
    monkeypatch.setattr(vault_mod, "_client", lambda: FakeClient())

    result = await vault_mod.upload_receipt_attachment("ws1", "r.png", "image/png", b"data")
    assert result == "existing-vf"
    assert put_calls == []  # deduplicated — no re-upload
    assert execute_calls == []  # no size increment for a dedup hit


async def test_upload_new_file_puts_object_and_increments_size(monkeypatch):
    put_calls = []
    execute_calls = []

    async def fake_usage(_ws):
        return {"used": 0, "max_mb": 100}

    async def fake_fingerprint(*a, **k):
        return None

    async def fake_fetchrow(query, *args):
        return {"id": "new-vf", "key": "vault/ws1/new-key.png"}

    async def fake_execute(query, *args):
        execute_calls.append(args)

    class FakeClient:
        def put_object(self, **kwargs):
            put_calls.append(kwargs)

    monkeypatch.setattr(vault_mod, "_get_usage_and_quota", fake_usage)
    monkeypatch.setattr(vault_mod, "_find_existing_by_fingerprint", fake_fingerprint)
    monkeypatch.setattr(vault_mod, "fetchrow", fake_fetchrow)
    monkeypatch.setattr(vault_mod, "execute", fake_execute)
    monkeypatch.setattr(vault_mod, "_client", lambda: FakeClient())
    monkeypatch.setattr(
        vault_mod, "get_settings", lambda: type("S", (), {"BUCKET_NAME": "bucket1"})()
    )

    result = await vault_mod.upload_receipt_attachment("ws1", "r.png", "image/png", b"data")
    assert result == "new-vf"
    assert len(put_calls) == 1
    assert execute_calls  # size increment fired
