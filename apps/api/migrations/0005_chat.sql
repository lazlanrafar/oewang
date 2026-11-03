-- Chat sessions, messages and per-workspace agent settings.
-- See docs/data-model.md#chat.

CREATE TABLE ai_sessions (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    title        text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz
);

CREATE INDEX ai_sessions_workspace_idx
    ON ai_sessions (workspace_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE ai_messages (
    id           text PRIMARY KEY,
    session_id   text NOT NULL REFERENCES ai_sessions (id) ON DELETE CASCADE,
    -- Denormalized so a workspace-wide query does not need the join.
    workspace_id text NOT NULL,
    role         text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content      text NOT NULL,
    -- Tool calls, tool results, receipt drafts, file references.
    -- Shape in docs/features/chat.md#message-attachments.
    attachments  jsonb,
    created_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz
);

CREATE INDEX ai_messages_session_created_idx
    ON ai_messages (session_id, created_at) WHERE deleted_at IS NULL;

-- One row per workspace, written when the workspace is seeded. The read
-- still tolerates its absence, because a row that only holds defaults is
-- not worth a migration to backfill. The old app also stored model,
-- temperature and max_steps; the loop read none of them, so they are gone.
CREATE TABLE ai_agent_settings (
    id                  text PRIMARY KEY,
    workspace_id        text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    custom_instructions text,
    response_language   text NOT NULL DEFAULT 'auto' CHECK (
                            response_language IN ('auto', 'english', 'indonesian')
                        ),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ai_agent_settings_workspace_idx ON ai_agent_settings (workspace_id);
