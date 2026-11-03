-- The document a statement import was read from (AI-4).
--
-- The job row already records what happened to the rows; without this it
-- does not record what they were read from. Two things need that: a retry
-- after a failure re-reads the file the job already has rather than asking
-- the user to upload it again, and the audit trail can answer "where did
-- these forty rows come from" at the job rather than only at each row's
-- `source = 'import'`.
--
-- Nullable because every job that already exists predates the column, and
-- because the CSV path writes no job row at all: it is synchronous and its
-- counts come back in the response.
-- See docs/data-model.md#ledger.

ALTER TABLE transaction_import_jobs
    ADD COLUMN vault_file_id text REFERENCES vault_files (id);
