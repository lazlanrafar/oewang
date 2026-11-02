-- Identity and tenancy.
-- See docs/data-model.md#identity-and-tenancy and docs/security/auth.md.
--
-- Every timestamp is timestamptz. The docs originally said `timestamp`,
-- carried over from the old app, but a naive timestamp means whatever the
-- writer's clock meant, which is wrong for a product with a workspace
-- timezone and a mobile client. Postgres stores timestamptz as UTC and
-- converts on read, which is the behaviour the API contract already assumes.

CREATE TABLE users (
    id              text PRIMARY KEY,
    email           text NOT NULL,
    name            text,
    profile_picture text,
    -- Argon2id. Never selected into a response type (AUTH-1).
    password_hash   text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_idx ON users (lower(email));

CREATE TABLE workspaces (
    id            text PRIMARY KEY,
    name          text NOT NULL,
    slug          text NOT NULL,
    country       text,
    -- Locked once any transaction exists (WAL-6): every base_amount is
    -- denominated in it, so a change would reinterpret the whole ledger.
    currency_code text NOT NULL DEFAULT 'IDR',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    deleted_at    timestamptz
);

CREATE UNIQUE INDEX workspaces_slug_idx ON workspaces (slug) WHERE deleted_at IS NULL;

CREATE TABLE user_workspaces (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    user_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role         text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    joined_at    timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz
);

CREATE UNIQUE INDEX workspace_user_idx ON user_workspaces (workspace_id, user_id);

-- Auth resolves membership by user_id alone on every request. The composite
-- index above is led by workspace_id and cannot serve that lookup.
CREATE INDEX user_workspaces_user_idx ON user_workspaces (user_id, deleted_at);

CREATE TABLE refresh_tokens (
    id           text PRIMARY KEY,
    user_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    -- SHA-256 only. A database leak yields no usable token (AUTH-8).
    token_hash   text NOT NULL,
    -- Shared by every token descended from one login. Reuse revokes the family.
    family_id    text NOT NULL,
    expires_at   timestamptz NOT NULL,
    used_at      timestamptz,
    revoked_at   timestamptz,
    user_agent   text,
    ip           text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX refresh_tokens_hash_idx ON refresh_tokens (token_hash);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id, revoked_at);

CREATE TABLE password_reset_tokens (
    id         text PRIMARY KEY,
    user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX password_reset_tokens_hash_idx ON password_reset_tokens (token_hash);

CREATE TABLE workspace_invitations (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    email        text NOT NULL,
    role         text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    token        text NOT NULL,
    invited_by   text NOT NULL REFERENCES users (id),
    expires_at   timestamptz NOT NULL,
    accepted_at  timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz
);

CREATE UNIQUE INDEX workspace_invitations_token_idx ON workspace_invitations (token);
CREATE INDEX workspace_invitations_workspace_idx
    ON workspace_invitations (workspace_id) WHERE deleted_at IS NULL;
