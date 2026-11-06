-- The ready flag goes (owner's decision, 2026-11-06, D107). It marked a
-- transaction as reviewed, nothing read it but the list's own filter and
-- badge, and a column that means nothing invites code that thinks it does.
ALTER TABLE transactions DROP COLUMN is_ready;
