"""Drive the auth and workspace routes over OWE1.

These are the rules that matter most and are hardest to verify by reading:
rotation, reuse detection, the last-owner guard, and the fact that a
demoted member stops being able to write before their token expires.

Skipped when the API is not reachable, so `pytest` stays runnable without
the stack up.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

import pytest
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey

from app.core import owe1

API_URL = os.environ.get("API_INTERNAL_URL", "http://api:3002")
TIMEOUT = 15


def _plain(method: str, path: str, body: bytes | None = None, headers: dict | None = None):
    request = urllib.request.Request(
        API_URL + path, data=body, method=method, headers=headers or {}
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def _api_reachable() -> bool:
    try:
        return _plain("GET", "/health")[0] == 200
    except Exception:  # noqa: BLE001
        return False


pytestmark = pytest.mark.skipif(not _api_reachable(), reason=f"API not reachable at {API_URL}")


class Client:
    """An OWE1 client that also carries a bearer token."""

    def __init__(self) -> None:
        status, raw = _plain("GET", "/.well-known/oewang-keys")
        assert status == 200
        pinned = {k["kid"]: owe1.unb64(k["public_key"]) for k in json.loads(raw)}

        private = X25519PrivateKey.generate()
        client_public = private.public_key().public_bytes_raw()
        client_nonce = os.urandom(16)

        status, raw = _plain(
            "POST",
            "/v1/handshake",
            json.dumps(
                {
                    "v": 1,
                    "client_public_key": owe1.b64(client_public),
                    "client_nonce": owe1.b64(client_nonce),
                }
            ).encode(),
            {"content-type": "application/json"},
        )
        assert status == 200, raw
        handshake = json.loads(raw)

        owe1.verify_handshake(
            pinned[handshake["kid"]],
            owe1.unb64(handshake["signature"]),
            owe1.transcript(
                client_public,
                owe1.unb64(handshake["server_public_key"]),
                client_nonce,
                owe1.unb64(handshake["server_nonce"]),
                handshake["session_id"],
                handshake["expires_at"],
                handshake["server_time"],
            ),
        )

        self.session_id = handshake["session_id"]
        self.keys = owe1.derive_keys(
            private,
            owe1.unb64(handshake["server_public_key"]),
            client_nonce,
            owe1.unb64(handshake["server_nonce"]),
            self.session_id,
        )
        self.access_token: str | None = None

    def call(self, method: str, path: str, payload: dict | None = None, query: str = ""):
        request_id = os.urandom(16).hex().upper()
        timestamp = owe1.now_secs()

        headers = {
            "x-owe-session": self.session_id,
            "x-owe-request-id": request_id,
            "x-owe-timestamp": str(timestamp),
            "content-type": owe1.CONTENT_TYPE,
            "x-owe-query": owe1.seal_field(
                self.keys.client_to_server,
                owe1.aad_query(self.session_id, method, path, request_id, timestamp),
                query.encode(),
            ),
        }
        if self.access_token:
            headers["authorization"] = f"Bearer {self.access_token}"

        body = None
        if payload is not None:
            body = json.dumps(
                owe1.seal(
                    self.keys.client_to_server,
                    owe1.aad_request(self.session_id, method, path, request_id, timestamp),
                    json.dumps(payload).encode(),
                )
            ).encode()

        status, raw = _plain(method, path, body, headers)

        if not raw:
            return status, None
        try:
            opened = owe1.open_sealed(
                self.keys.server_to_client,
                owe1.aad_response(self.session_id, request_id, status),
                json.loads(raw),
            )
            return status, json.loads(opened)
        except Exception:  # a transport error answers in plaintext
            return status, json.loads(raw)

    def register(self, suffix: str, *, workspace: bool = True) -> dict:
        """Sign up, then by default open a workspace and switch into it.

        Signing up opens a session with no workspace (D109); the app's
        create-workspace page is what makes the first one.
        """
        status, body = self.call(
            "POST",
            "/v1/auth/register",
            {
                "email": f"{suffix}@oewang.test",
                "password": "a-long-enough-password",
                "name": suffix,
            },
        )
        assert status == 201, body
        self.access_token = body["data"]["access_token"]
        if not workspace:
            return body["data"]

        status, created = self.call(
            "POST", "/v1/workspaces", {"name": f"Workspace {suffix}", "currency_code": "IDR"}
        )
        assert status == 201, created
        status, switched = self.call(
            "POST", "/v1/auth/switch-workspace", {"workspace_id": created["data"]["id"]}
        )
        assert status == 200, switched
        self.access_token = switched["data"]["access_token"]
        return switched["data"]


def unique(prefix: str) -> str:
    return f"{prefix}-{os.urandom(5).hex()}"


# ------------------------------------------------------------- registration


def test_register_opens_a_session_with_no_workspace():
    client = Client()
    session = client.register(unique("fresh"), workspace=False)

    assert session["access_token"] and session["refresh_token"]
    assert session["workspace_id"] is None
    assert session["role"] is None

    status, body = client.call("GET", "/v1/auth/me")
    assert status == 200
    assert body["data"]["workspace"] is None
    assert body["data"]["role"] is None

    status, body = client.call("GET", "/v1/workspaces")
    assert status == 200
    assert body["data"] == []

    # Workspace data stays out of reach until there is a workspace (D109).
    status, body = client.call("GET", "/v1/workspaces/current")
    assert status == 403
    assert body["error"]["code"] == "NO_WORKSPACE"


def test_the_first_workspace_makes_the_user_its_owner():
    client = Client()
    session = client.register(unique("owner"))

    assert session["role"] == "owner"

    status, body = client.call("GET", "/v1/auth/me")
    assert status == 200
    assert body["data"]["role"] == "owner"
    assert body["data"]["workspace"]["currency_code"] == "IDR"


def test_login_without_a_workspace_opens_a_session_without_one():
    client = Client()
    suffix = unique("noworkspace")
    client.register(suffix, workspace=False)

    status, body = client.call(
        "POST",
        "/v1/auth/login",
        {"email": f"{suffix}@oewang.test", "password": "a-long-enough-password"},
    )
    assert status == 200
    assert body["data"]["workspace_id"] is None


def test_register_seeds_the_workspace_defaults():
    client = Client()
    client.register(unique("seeded"))

    # The default wallet and category set a new workspace gets (CAT-3). The
    # wallets route lands in US-011; until then this is checked through the
    # workspace listing, which proves the transaction committed as a whole.
    status, body = client.call("GET", "/v1/workspaces")
    assert status == 200
    assert len(body["data"]) == 1


def test_register_rejects_a_duplicate_email():
    client = Client()
    suffix = unique("dup")
    client.register(suffix)

    status, body = client.call(
        "POST",
        "/v1/auth/register",
        {
            "email": f"{suffix}@oewang.test",
            "password": "a-long-enough-password",
        },
    )
    assert status == 409
    assert body["error"]["code"] == "EMAIL_TAKEN"


def test_register_rejects_a_short_password():
    client = Client()
    status, body = client.call(
        "POST",
        "/v1/auth/register",
        {"email": f"{unique('short')}@oewang.test", "password": "short"},
    )
    assert status == 422
    assert body["error"]["code"] == "VALIDATION_FAILED"
    assert "password" in body["error"]["fields"]


# ------------------------------------------------------------------- login


def test_login_succeeds_with_the_right_password():
    client = Client()
    suffix = unique("login")
    client.register(suffix)

    status, body = client.call(
        "POST",
        "/v1/auth/login",
        {"email": f"{suffix}@oewang.test", "password": "a-long-enough-password"},
    )
    assert status == 200
    assert body["data"]["role"] == "owner"


def test_login_gives_the_same_answer_for_a_wrong_password_and_an_unknown_email():
    client = Client()
    suffix = unique("timing")
    client.register(suffix)

    _, wrong = client.call(
        "POST", "/v1/auth/login", {"email": f"{suffix}@oewang.test", "password": "wrong-password-x"}
    )
    _, unknown = client.call(
        "POST",
        "/v1/auth/login",
        {"email": f"{unique('nobody')}@oewang.test", "password": "wrong-password-x"},
    )

    # Identical code and message: the endpoint cannot be used to discover
    # who has an account (AUTH-5).
    assert wrong["error"]["code"] == unknown["error"]["code"] == "INVALID_CREDENTIALS"
    assert wrong["error"]["message"] == unknown["error"]["message"]


def test_email_lookup_ignores_case():
    client = Client()
    suffix = unique("Case")
    client.register(suffix.lower())

    status, _ = client.call(
        "POST",
        "/v1/auth/login",
        {"email": f"{suffix.upper()}@OEWANG.TEST", "password": "a-long-enough-password"},
    )
    assert status == 200


# ------------------------------------------------------------------ tokens


def test_access_token_is_required():
    client = Client()
    status, body = client.call("GET", "/v1/auth/me")
    assert status == 401
    assert body["error"]["code"] == "UNAUTHENTICATED"


def test_refresh_rotates_the_token():
    client = Client()
    session = client.register(unique("rotate"))

    status, body = client.call(
        "POST", "/v1/auth/refresh", {"refresh_token": session["refresh_token"]}
    )
    assert status == 200
    assert body["data"]["refresh_token"] != session["refresh_token"]


def test_reusing_a_rotated_token_revokes_the_whole_family():
    client = Client()
    first = client.register(unique("reuse"))

    _, rotated = client.call("POST", "/v1/auth/refresh", {"refresh_token": first["refresh_token"]})
    second_token = rotated["data"]["refresh_token"]

    # Replaying the first token is either theft or a race. Both are handled
    # the same way, because they are indistinguishable (AUTH-9).
    status, _ = client.call("POST", "/v1/auth/refresh", {"refresh_token": first["refresh_token"]})
    assert status == 401

    # The descendant is revoked too, so an attacker who rotated cannot keep
    # a parallel session alive.
    status, _ = client.call("POST", "/v1/auth/refresh", {"refresh_token": second_token})
    assert status == 401


def test_logout_revokes_the_refresh_token():
    client = Client()
    session = client.register(unique("logout"))

    status, _ = client.call("POST", "/v1/auth/logout", {"refresh_token": session["refresh_token"]})
    assert status == 204

    status, _ = client.call(
        "POST", "/v1/auth/refresh", {"refresh_token": session["refresh_token"]}
    )
    assert status == 401


def test_sessions_lists_live_refresh_tokens():
    client = Client()
    client.register(unique("sessions"))

    status, body = client.call("GET", "/v1/auth/sessions")
    assert status == 200
    assert len(body["data"]) >= 1
    # Shown for recognition, never used for authorization.
    assert "user_agent" in body["data"][0]


# -------------------------------------------------------------- workspaces


def test_switch_workspace_refuses_a_workspace_the_user_is_not_in():
    a, b = Client(), Client()
    a.register(unique("alpha"))
    other = b.register(unique("beta"))

    status, body = a.call(
        "POST", "/v1/auth/switch-workspace", {"workspace_id": other["workspace_id"]}
    )
    assert status == 403
    assert body["error"]["code"] == "NOT_A_MEMBER"


def test_invite_and_accept_grants_membership():
    owner, invitee = Client(), Client()
    owner.register(unique("inviter"))
    invitee_suffix = unique("invitee")
    invitee.register(invitee_suffix)

    status, created = owner.call(
        "POST",
        "/v1/workspaces/current/invites",
        {"email": f"{invitee_suffix}@oewang.test", "role": "member"},
    )
    assert status == 201, created
    token = created["data"]["token"]

    status, accepted = invitee.call("POST", "/v1/workspaces/accept-invite", {"token": token})
    # The workspace joined comes back, so the app can switch into it (D104).
    assert status == 200, accepted
    assert accepted["data"]["workspace_id"]

    status, body = invitee.call("GET", "/v1/workspaces")
    assert status == 200
    assert len(body["data"]) == 2

    # Single use: the same token cannot be redeemed twice.
    status, body = invitee.call("POST", "/v1/workspaces/accept-invite", {"token": token})
    assert status == 404
    assert body["error"]["code"] == "INVITE_INVALID"


def test_an_admin_cannot_invite_an_owner():
    owner, admin = Client(), Client()
    owner.register(unique("boss"))
    admin_suffix = unique("admin")
    admin.register(admin_suffix)

    _, created = owner.call(
        "POST",
        "/v1/workspaces/current/invites",
        {"email": f"{admin_suffix}@oewang.test", "role": "admin"},
    )
    admin.call("POST", "/v1/workspaces/accept-invite", {"token": created["data"]["token"]})

    owner_workspace = owner.call("GET", "/v1/auth/me")[1]["data"]["workspace"]["id"]
    _, switched = admin.call("POST", "/v1/auth/switch-workspace", {"workspace_id": owner_workspace})
    admin.access_token = switched["data"]["access_token"]

    # Nobody may grant a role above their own.
    status, body = admin.call(
        "POST",
        "/v1/workspaces/current/invites",
        {"email": f"{unique('new')}@oewang.test", "role": "owner"},
    )
    assert status == 403
    assert body["error"]["code"] == "INSUFFICIENT_ROLE"


def test_the_last_owner_cannot_be_removed_or_demoted():
    owner = Client()
    session = owner.register(unique("solo"))

    status, body = owner.call(
        "PATCH", f"/v1/workspaces/current/members/{session['user_id']}", {"role": "admin"}
    )
    assert status == 409
    assert body["error"]["code"] == "LAST_OWNER"

    status, body = owner.call(
        "DELETE", f"/v1/workspaces/current/members/{session['user_id']}"
    )
    assert status == 409
    assert body["error"]["code"] == "LAST_OWNER"


def test_a_member_cannot_write():
    owner, member = Client(), Client()
    owner.register(unique("ownerw"))
    member_suffix = unique("memberw")
    member.register(member_suffix)

    _, created = owner.call(
        "POST",
        "/v1/workspaces/current/invites",
        {"email": f"{member_suffix}@oewang.test", "role": "member"},
    )
    member.call("POST", "/v1/workspaces/accept-invite", {"token": created["data"]["token"]})

    owner_workspace = owner.call("GET", "/v1/auth/me")[1]["data"]["workspace"]["id"]
    _, switched = member.call(
        "POST", "/v1/auth/switch-workspace", {"workspace_id": owner_workspace}
    )
    member.access_token = switched["data"]["access_token"]

    # Reads are allowed.
    assert member.call("GET", "/v1/workspaces/current/members")[0] == 200

    # Writes are not.
    status, body = member.call("PATCH", "/v1/workspaces/current", {"name": "Renamed"})
    assert status == 403
    assert body["error"]["code"] == "INSUFFICIENT_ROLE"


def test_a_demoted_member_loses_write_access_before_their_token_expires():
    """The reason AuthWrite re-reads the membership row.

    The access token still says "admin" for up to fifteen minutes. If writes
    trusted that snapshot, a demotion would not take effect until it expired.
    """
    owner, other = Client(), Client()
    owner.register(unique("demoter"))
    other_suffix = unique("demoted")
    other.register(other_suffix)

    _, created = owner.call(
        "POST",
        "/v1/workspaces/current/invites",
        {"email": f"{other_suffix}@oewang.test", "role": "admin"},
    )
    other.call("POST", "/v1/workspaces/accept-invite", {"token": created["data"]["token"]})

    me = owner.call("GET", "/v1/auth/me")[1]["data"]
    _, switched = other.call(
        "POST", "/v1/auth/switch-workspace", {"workspace_id": me["workspace"]["id"]}
    )
    other.access_token = switched["data"]["access_token"]
    other_user_id = switched["data"]["user_id"]

    assert other.call("PATCH", "/v1/workspaces/current", {"name": "Allowed"})[0] == 204

    # Demote, without touching the token the other client still holds.
    assert (
        owner.call(
            "PATCH", f"/v1/workspaces/current/members/{other_user_id}", {"role": "member"}
        )[0]
        == 204
    )

    status, body = other.call("PATCH", "/v1/workspaces/current", {"name": "Refused"})
    assert status == 403
    assert body["error"]["code"] == "INSUFFICIENT_ROLE"


def test_removing_a_member_ends_their_sessions():
    owner, member = Client(), Client()
    owner.register(unique("remover"))
    member_suffix = unique("removed")
    member_session = member.register(member_suffix)

    _, created = owner.call(
        "POST",
        "/v1/workspaces/current/invites",
        {"email": f"{member_suffix}@oewang.test", "role": "member"},
    )
    member.call("POST", "/v1/workspaces/accept-invite", {"token": created["data"]["token"]})

    owner.call("DELETE", f"/v1/workspaces/current/members/{member_session['user_id']}")

    # Their refresh token stops working immediately, rather than surviving
    # until it expires.
    status, _ = member.call(
        "POST", "/v1/auth/refresh", {"refresh_token": member_session["refresh_token"]}
    )
    assert status == 401


# ---------------------------------------------------------- password reset


def test_forgot_password_answers_the_same_for_a_known_and_unknown_address():
    client = Client()
    suffix = unique("forgot")
    client.register(suffix)

    known = client.call("POST", "/v1/auth/forgot-password", {"email": f"{suffix}@oewang.test"})
    unknown = client.call(
        "POST", "/v1/auth/forgot-password", {"email": f"{unique('ghost')}@oewang.test"}
    )

    # 204 either way, so the endpoint cannot enumerate users (AUTH-10).
    assert known[0] == unknown[0] == 204


def test_reset_with_an_invalid_token_is_refused():
    client = Client()
    status, body = client.call(
        "POST",
        "/v1/auth/reset-password",
        {"token": "not-a-real-token", "password": "new-password-long"},
    )
    assert status == 404
    assert body["error"]["code"] == "RESET_TOKEN_INVALID"


def test_reset_rejects_a_short_new_password():
    client = Client()
    status, body = client.call(
        "POST", "/v1/auth/reset-password", {"token": "whatever", "password": "short"}
    )
    assert status == 422
    assert body["error"]["code"] == "VALIDATION_FAILED"
