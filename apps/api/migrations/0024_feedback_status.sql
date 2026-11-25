-- Feedback gets an answer in the console (CSL-8, D104 amended): open or
-- done, and a note only operators see.
ALTER TABLE feedback
    ADD COLUMN status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
    ADD COLUMN operator_note text CHECK (char_length(operator_note) <= 2000),
    ADD COLUMN resolved_at   timestamptz;

CREATE INDEX feedback_status_idx ON feedback (status, created_at DESC)
    WHERE deleted_at IS NULL;
