-- Append-only audit trail. A row is written inside the same database
-- transaction as the mutation it describes (D14, OPS-1), so a failed commit
-- cannot leave a log of something that never happened.
-- See docs/data-model.md#audit.

CREATE TABLE audit_logs (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    -- The real user, even when the write came from a chat tool call.
    user_id      text NOT NULL REFERENCES users (id),
    -- "{entity}.{verb}", for example "transaction.deleted".
    action       text NOT NULL,
    entity       text NOT NULL,
    entity_id    text NOT NULL,
    before       jsonb,
    after        jsonb,
    -- New in this rewrite: the old app could not tell a chat-driven write
    -- from a manual one.
    source       text NOT NULL DEFAULT 'web' CHECK (
                     source IN ('web', 'chat', 'import', 'receipt')
                 ),
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_workspace_entity_idx
    ON audit_logs (workspace_id, entity, entity_id, created_at DESC);
