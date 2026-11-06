-- Feedback a member sends from settings (FB-1, D104).
--
-- Stored and read in the database: there is no admin inbox. The old app's
-- screenshot and review-status columns are not carried over; nothing here
-- would show or change them.
CREATE TABLE feedback (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    user_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type         text NOT NULL CHECK (type IN ('bug', 'feature', 'other')),
    message      text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
    created_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz
);

CREATE INDEX feedback_workspace_idx ON feedback (workspace_id, created_at DESC)
    WHERE deleted_at IS NULL;
