-- The MCP server (D106, MCP-1 to MCP-8).
--
-- One token table for both ways in: a personal access token a person
-- creates in the account area, and an access token an OAuth client earns
-- through the consent page. Only hashes are stored (AUTH-8), and a token's
-- reach is a set of workspaces or, when `workspace_ids` is NULL, every
-- workspace the person belongs to at the moment of each call.

CREATE TABLE oauth_clients (
    id            text PRIMARY KEY,
    -- As the client registered it. Shown on the consent page marked as not
    -- verified, because anyone can register any name.
    name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    redirect_uris text[] NOT NULL CHECK (cardinality(redirect_uris) BETWEEN 1 AND 10),
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_used_at  timestamptz
);

CREATE TABLE mcp_tokens (
    id                 text PRIMARY KEY,
    user_id            text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind               text NOT NULL CHECK (kind IN ('pat', 'oauth')),
    name               text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    client_id          text REFERENCES oauth_clients (id) ON DELETE CASCADE,
    -- SHA-256 of the token. The token itself is shown once and never kept.
    token_hash         text NOT NULL UNIQUE,
    -- The first characters, so a list can tell two tokens apart.
    token_prefix       text NOT NULL,
    -- OAuth only: the refresh token's hash, rotated on every use.
    refresh_hash       text UNIQUE,
    -- OAuth only: every rotation of one grant shares it, so a replayed
    -- refresh token revokes the whole grant.
    family_id          text,
    -- NULL is every workspace the person is a member of, read per call.
    workspace_ids      text[],
    expires_at         timestamptz,
    refresh_expires_at timestamptz,
    last_used_at       timestamptz,
    revoked_at         timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mcp_tokens_kind_shape CHECK (
        (kind = 'pat' AND client_id IS NULL AND refresh_hash IS NULL)
        OR (kind = 'oauth' AND client_id IS NOT NULL)
    )
);

CREATE INDEX mcp_tokens_user_idx ON mcp_tokens (user_id, created_at DESC)
    WHERE revoked_at IS NULL;
CREATE INDEX mcp_tokens_family_idx ON mcp_tokens (family_id) WHERE family_id IS NOT NULL;

CREATE TABLE oauth_codes (
    code_hash      text PRIMARY KEY,
    client_id      text NOT NULL REFERENCES oauth_clients (id) ON DELETE CASCADE,
    user_id        text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    workspace_ids  text[],
    redirect_uri   text NOT NULL,
    -- PKCE is required: S256 of the verifier, base64url.
    code_challenge text NOT NULL,
    expires_at     timestamptz NOT NULL,
    used_at        timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- A write made through an MCP tool says so, as a chat one says `chat`.
ALTER TABLE transactions DROP CONSTRAINT transactions_source_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_source_check
    CHECK (source IN ('web', 'chat', 'import', 'receipt', 'telegram', 'mcp'));

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_source_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_source_check
    CHECK (source IN ('web', 'chat', 'import', 'receipt', 'telegram', 'migration', 'mcp'));
