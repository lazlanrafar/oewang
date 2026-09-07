"""oewang-session JWT verification + membership resolution — port of
apps/api/plugins/auth.ts's verifyJwt + getAuth (jose HS256 → PyJWT HS256).

Only /chat/web and /chat/web/stream call this (the only place identity comes
from an end-user token). Every other apps/ai route stays x-api-key-only,
service-to-service trust — do not add this to those routes.

No Redis cache (unlike the TS 30s auth:user:<id> cache) — one JOIN query per
call. Simplification accepted for this migration; add a cache later if the
extra query per chat turn measurably matters.
"""

import jwt as pyjwt

from app.config import get_settings
from app.core.database import fetch


class AuthError(Exception):
    """Missing/invalid JWT, or the token's workspace_id isn't a live membership."""


def verify_jwt(token: str) -> dict | None:
    secret = get_settings().JWT_SECRET
    if not secret:
        return None
    try:
        payload = pyjwt.decode(token, secret, algorithms=["HS256"])
    except pyjwt.PyJWTError:
        return None

    user_id = payload.get("user_id")
    if not user_id:
        return None
    workspace_id = payload.get("workspace_id") or payload.get("workspaceId") or ""
    return {
        "user_id": user_id,
        "workspace_id": workspace_id,
        "email": payload.get("email"),
        "system_role": payload.get("system_role"),
    }


def _resolve_workspace_id(preferred: str | None, membership_ids: list[str]) -> str:
    if preferred and preferred in membership_ids:
        return preferred
    return membership_ids[0] if membership_ids else ""


async def get_auth(token: str) -> dict | None:
    """Returns {user_id, workspace_id, workspace_role, email, system_role} or None.

    Ports the one-round-trip user+memberships query and, critically, the
    workspace-forgery defense: if the JWT names a workspace_id, the user must
    still have a live (non-deleted) membership in it, or this returns None.
    """
    jwt_payload = verify_jwt(token)
    if jwt_payload is None:
        return None

    rows = await fetch(
        """
        SELECT
            u.email                AS email,
            u.workspace_id         AS default_workspace_id,
            u.system_role          AS system_role,
            uw.workspace_id        AS membership_workspace_id,
            uw.role                AS membership_role,
            w.id                   AS live_workspace_id
        FROM users u
        LEFT JOIN user_workspaces uw
            ON uw.user_id = u.id AND uw.deleted_at IS NULL
        LEFT JOIN workspaces w
            ON w.id = uw.workspace_id AND w.deleted_at IS NULL
        WHERE u.id = $1
        """,
        jwt_payload["user_id"],
    )
    if not rows:
        return None

    db_user = rows[0]
    memberships: list[dict] = []
    for row in rows:
        if row["membership_workspace_id"] and row["live_workspace_id"]:
            memberships.append(
                {"workspace_id": row["membership_workspace_id"], "role": row["membership_role"]}
            )

    membership_ids = [m["workspace_id"] for m in memberships]
    role_by_workspace = {m["workspace_id"]: m["role"] for m in memberships}

    # Enforce workspace-scoped access: a token requesting a workspace the user
    # is no longer an active member of (removed after the token was issued)
    # must not resolve — this is a real authorization control, not plumbing.
    jwt_workspace_id = jwt_payload["workspace_id"]
    if jwt_workspace_id and jwt_workspace_id not in membership_ids:
        return None

    workspace_id = _resolve_workspace_id(
        jwt_workspace_id or db_user["default_workspace_id"], membership_ids
    )
    workspace_role = role_by_workspace.get(workspace_id) if workspace_id else None

    return {
        "user_id": jwt_payload["user_id"],
        "workspace_id": workspace_id,
        "workspace_role": workspace_role,
        "email": jwt_payload["email"] or db_user["email"],
        "system_role": db_user["system_role"] or jwt_payload["system_role"] or "user",
    }
