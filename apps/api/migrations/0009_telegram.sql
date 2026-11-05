-- Telegram: linked chats, one-time link tokens, and the updates already
-- handled. See docs/data-model.md#telegram and docs/features/telegram.md.
--
-- A link binds one private Telegram chat, and the Telegram account that
-- opened it, to one user in one workspace (D85). Nothing a Telegram message
-- carries names a workspace or a user: the link row is the only place that
-- answer comes from, which is the hole the old app's `/start <slug>` left
-- open.

CREATE TABLE telegram_links (
    id                text PRIMARY KEY,
    workspace_id      text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    user_id           text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Telegram's ids are 64-bit integers. A private chat's id equals the
    -- user's id today, but the Bot API does not promise it, so both are
    -- kept and both are checked on every update.
    chat_id           bigint NOT NULL,
    telegram_user_id  bigint NOT NULL,
    -- For the Apps page only ("Connected as @name"). Never used to decide
    -- anything: a username can be changed or given away.
    telegram_username text,
    -- The conversation text messages go to. Created on the first message,
    -- not at link time, so a chat used only for receipts leaves no empty
    -- conversation in the web list.
    ai_session_id     text REFERENCES ai_sessions (id) ON DELETE SET NULL,
    linked_at         timestamptz NOT NULL DEFAULT now(),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz
);

-- One live link per user per workspace, and one live link per chat: a chat
-- that acted for two workspaces would have to guess which one a receipt
-- belongs to.
CREATE UNIQUE INDEX telegram_links_member_idx
    ON telegram_links (workspace_id, user_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX telegram_links_chat_idx
    ON telegram_links (chat_id) WHERE deleted_at IS NULL;

-- The deep link's `start` value, hashed. Same shape and rules as a password
-- reset token (AUTH-8): random, stored as SHA-256, short-lived, single use.
CREATE TABLE telegram_link_tokens (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    user_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash   text NOT NULL,
    expires_at   timestamptz NOT NULL,
    used_at      timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX telegram_link_tokens_hash_idx ON telegram_link_tokens (token_hash);

-- Updates already handled, by Telegram's own id. Not workspace-scoped: the
-- bot is one bot, and an update is claimed before anyone knows which
-- workspace it is for. A row exists so that an update delivered again after
-- a restart (long polling acknowledges by asking for the next one) is not
-- handled twice, which for a receipt would be a second transaction (D84).
CREATE TABLE telegram_updates (
    update_id   bigint PRIMARY KEY,
    received_at timestamptz NOT NULL DEFAULT now()
);

-- A transaction saved from a Telegram message says so, as a chat one says
-- `chat` (D74, D86).
ALTER TABLE transactions DROP CONSTRAINT transactions_source_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_source_check
    CHECK (source IN ('web', 'chat', 'import', 'receipt', 'telegram'));

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_source_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_source_check
    CHECK (source IN ('web', 'chat', 'import', 'receipt', 'telegram'));
