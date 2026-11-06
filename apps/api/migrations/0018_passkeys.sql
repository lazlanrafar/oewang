-- Sign up without a workspace, and passkeys (D109, D110).
-- See docs/data-model.md#identity-and-tenancy and docs/security/auth.md#passkeys.

-- A session may now exist before its user has a workspace: registration
-- opens one, and the user creates a workspace or accepts an invitation
-- afterwards (D109). Every session that has a workspace still names it.
ALTER TABLE refresh_tokens ALTER COLUMN workspace_id DROP NOT NULL;

-- A WebAuthn credential a user signs in with (D110). Belongs to a person,
-- not to a workspace, like the password it stands beside.
CREATE TABLE passkeys (
    id            text PRIMARY KEY,
    user_id       text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- The credential ID, base64url, as the authenticator reports it on
    -- every sign-in. How a discoverable sign-in finds its row.
    credential_id text NOT NULL,
    -- webauthn-rs `Passkey`: the public key, the signature counter and the
    -- backup flags. Public material only; nothing here signs anything.
    credential    jsonb NOT NULL,
    -- What the user sees in the list. Defaults to the device it was made on.
    name          text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_used_at  timestamptz,
    deleted_at    timestamptz
);

-- One account per credential, ever: a credential ID registered twice would
-- let whoever holds it choose which account they sign in to.
CREATE UNIQUE INDEX passkeys_credential_idx ON passkeys (credential_id);
CREATE INDEX passkeys_user_idx ON passkeys (user_id) WHERE deleted_at IS NULL;

-- The server half of a registration or sign-in in progress. webauthn-rs
-- requires it to stay on the server: a client that held it could replay a
-- challenge. Claimed once, like a reset token, and short lived.
CREATE TABLE passkey_ceremonies (
    id         text PRIMARY KEY,
    -- Set for a registration, null for a sign-in, which starts before
    -- anyone is known.
    user_id    text REFERENCES users (id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('register', 'authenticate')),
    state      jsonb NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
