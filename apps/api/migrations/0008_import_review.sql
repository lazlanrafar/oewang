-- What became of each row a statement import read (AI-6).
--
-- The job already counts imported, skipped and duplicate rows. A count
-- cannot answer "which of my rows was the duplicate", and that is the
-- question the review screen exists to answer, so the per-row outcome is
-- stored beside the counts.
--
-- jsonb rather than a table: these rows are a report, not ledger data.
-- Nothing joins them, nothing updates them, and they are written once and
-- read until the user closes the modal. A table would add a foreign key
-- and an index to carry a list that is always read whole.
--
-- The list is capped in the application; the counts are exact for the
-- whole file however long it is.
-- See docs/data-model.md#ledger.

ALTER TABLE transaction_import_jobs
    ADD COLUMN review jsonb;
