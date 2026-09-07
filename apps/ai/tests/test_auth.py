"""oewang-session JWT verification + membership resolution — the one real
authorization control ported into apps/ai (Decision 1 of the chatBegin/chatEnd
migration). Ports apps/api/plugins/auth.ts's verifyJwt + getAuth.
"""

from datetime import datetime, timedelta, timezone

import jwt as pyjwt

import app.core.auth as auth_mod


def _token(secret: str, **claims) -> str:
    payload = {"user_id": "u1", "workspace_id": "w1", "email": "a@b.com", **claims}
    return pyjwt.encode(payload, secret, algorithm="HS256")


def test_verify_jwt_valid_token(monkeypatch):
    monkeypatch.setattr(auth_mod, "get_settings", lambda: type("S", (), {"JWT_SECRET": "s3cr3t"})())
    token = _token("s3cr3t")
    result = auth_mod.verify_jwt(token)
    assert result == {"user_id": "u1", "workspace_id": "w1", "email": "a@b.com", "system_role": None}


def test_verify_jwt_wrong_secret_returns_none(monkeypatch):
    monkeypatch.setattr(auth_mod, "get_settings", lambda: type("S", (), {"JWT_SECRET": "s3cr3t"})())
    token = _token("wrong-secret")
    assert auth_mod.verify_jwt(token) is None


def test_verify_jwt_expired_returns_none(monkeypatch):
    monkeypatch.setattr(auth_mod, "get_settings", lambda: type("S", (), {"JWT_SECRET": "s3cr3t"})())
    token = _token("s3cr3t", exp=datetime.now(timezone.utc) - timedelta(days=1))
    assert auth_mod.verify_jwt(token) is None


def test_verify_jwt_malformed_returns_none(monkeypatch):
    monkeypatch.setattr(auth_mod, "get_settings", lambda: type("S", (), {"JWT_SECRET": "s3cr3t"})())
    assert auth_mod.verify_jwt("not-a-jwt") is None


def test_verify_jwt_missing_user_id_returns_none(monkeypatch):
    monkeypatch.setattr(auth_mod, "get_settings", lambda: type("S", (), {"JWT_SECRET": "s3cr3t"})())
    token = pyjwt.encode({"workspace_id": "w1"}, "s3cr3t", algorithm="HS256")
    assert auth_mod.verify_jwt(token) is None


def test_verify_jwt_no_secret_configured_returns_none(monkeypatch):
    monkeypatch.setattr(auth_mod, "get_settings", lambda: type("S", (), {"JWT_SECRET": ""})())
    token = _token("anything")
    assert auth_mod.verify_jwt(token) is None


def _rows(user_id="u1", workspace_id="w1", live=True, role="owner"):
    return [
        {
            "email": "a@b.com",
            "default_workspace_id": workspace_id,
            "system_role": "user",
            "membership_workspace_id": workspace_id if live else None,
            "membership_role": role if live else None,
            "live_workspace_id": workspace_id if live else None,
        }
    ]


async def test_get_auth_valid_token_and_live_membership(monkeypatch):
    monkeypatch.setattr(auth_mod, "get_settings", lambda: type("S", (), {"JWT_SECRET": "s3cr3t"})())

    async def fake_fetch(query, *args):
        return _rows()

    monkeypatch.setattr(auth_mod, "fetch", fake_fetch)
    token = _token("s3cr3t")
    result = await auth_mod.get_auth(token)
    assert result == {
        "user_id": "u1",
        "workspace_id": "w1",
        "workspace_role": "owner",
        "email": "a@b.com",
        "system_role": "user",
    }


async def test_get_auth_rejects_stale_workspace_membership(monkeypatch):
    """JWT names a workspace the user is no longer an active member of (e.g.
    removed after the token was issued) — must return None, not resolve to a
    different workspace or ignore the claim. This is the one real
    authorization control in this module."""
    monkeypatch.setattr(auth_mod, "get_settings", lambda: type("S", (), {"JWT_SECRET": "s3cr3t"})())

    async def fake_fetch(query, *args):
        # No live membership row for "w1" at all.
        return [
            {
                "email": "a@b.com",
                "default_workspace_id": None,
                "system_role": "user",
                "membership_workspace_id": None,
                "membership_role": None,
                "live_workspace_id": None,
            }
        ]

    monkeypatch.setattr(auth_mod, "fetch", fake_fetch)
    token = _token("s3cr3t", workspace_id="w1")
    assert await auth_mod.get_auth(token) is None


async def test_get_auth_no_user_row_returns_none(monkeypatch):
    monkeypatch.setattr(auth_mod, "get_settings", lambda: type("S", (), {"JWT_SECRET": "s3cr3t"})())

    async def fake_fetch(query, *args):
        return []

    monkeypatch.setattr(auth_mod, "fetch", fake_fetch)
    token = _token("s3cr3t")
    assert await auth_mod.get_auth(token) is None


async def test_get_auth_falls_back_to_first_membership_when_no_workspace_claim(monkeypatch):
    monkeypatch.setattr(auth_mod, "get_settings", lambda: type("S", (), {"JWT_SECRET": "s3cr3t"})())

    async def fake_fetch(query, *args):
        return _rows(workspace_id="w2")

    monkeypatch.setattr(auth_mod, "fetch", fake_fetch)
    token = _token("s3cr3t", workspace_id="")
    result = await auth_mod.get_auth(token)
    assert result["workspace_id"] == "w2"
