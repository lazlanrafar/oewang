-- Receipts waiting for the reader (D95, AI-12). When the AI service cannot
-- answer, the photo is already in the vault; this row keeps asking until it
-- can, then saves the expense. See docs/data-model.md#receipt-jobs.

CREATE TABLE receipt_jobs (
    id              text PRIMARY KEY,
    workspace_id    text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    user_id         text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    vault_file_id   text NOT NULL REFERENCES vault_files (id) ON DELETE CASCADE,
    -- Where the receipt came from, which is where the outcome is told.
    channel         text NOT NULL CHECK (channel IN ('web', 'telegram')),
    -- The Telegram chat to answer in. Null for the web.
    chat_id         bigint,
    status          text NOT NULL DEFAULT 'pending' CHECK (
                        status IN ('pending', 'processing', 'done', 'failed')
                    ),
    attempts        integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    -- The last refusal's code, never its message (OPS-3).
    last_error      text,
    transaction_id  text REFERENCES transactions (id) ON DELETE SET NULL,
    -- When the web told the person how it ended. Telegram is told at once.
    seen_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- The loop's one query: what is due.
CREATE INDEX receipt_jobs_due_idx
    ON receipt_jobs (next_attempt_at) WHERE status = 'pending';

-- One job per file: queuing the same receipt twice is the same request.
CREATE UNIQUE INDEX receipt_jobs_file_idx ON receipt_jobs (vault_file_id);

CREATE INDEX receipt_jobs_notice_idx
    ON receipt_jobs (workspace_id, user_id) WHERE seen_at IS NULL;
