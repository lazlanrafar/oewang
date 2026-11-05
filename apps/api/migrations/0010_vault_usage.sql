-- The vault as a browsable feature (D90), its thumbnails (D91), and the
-- per-workspace AI usage ledger (D92). See docs/data-model.md#files and
-- docs/data-model.md#usage.

-- Free labels a member puts on a file. Bounded by the API (VLT-9), not here,
-- so the rule lives in one place with its tests.
ALTER TABLE vault_files ADD COLUMN tags text[] NOT NULL DEFAULT '{}';

-- Whether a small preview exists at {key}/thumb. NULL means nobody has asked
-- yet; false means it cannot be made (a PDF, or bytes that do not decode),
-- so the API never tries the same file twice (D91).
ALTER TABLE vault_files ADD COLUMN thumbnail boolean;

-- One row per model call. Append-only, like audit_logs: nothing updates or
-- deletes a row, so a sum over it is the whole history (USG-2).
CREATE TABLE ai_usage (
    id            text PRIMARY KEY,
    workspace_id  text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    -- Who the call was made for. NULL for work no person started directly.
    user_id       text REFERENCES users (id) ON DELETE SET NULL,
    feature       text NOT NULL CHECK (
                      feature IN ('chat', 'telegram', 'receipt', 'categorize',
                                  'import', 'columns')
                  ),
    model         text,
    input_tokens  integer NOT NULL CHECK (input_tokens >= 0),
    output_tokens integer NOT NULL CHECK (output_tokens >= 0),
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_workspace_idx ON ai_usage (workspace_id, created_at);
