-- Monthly budgets, one per expense category (D103, BUD-1).
--
-- A budget is a limit and nothing else: what it has used is summed from the
-- ledger when it is read, so there is no running total to drift. The old
-- app's `period` column is not carried over; it was never read, and a
-- column that means nothing invites code that thinks it does. The amount is
-- in the workspace currency, which is the currency `base_amount` is in.
CREATE TABLE budgets (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    category_id  text NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    amount       numeric(19, 4) NOT NULL CHECK (amount > 0),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz
);

CREATE INDEX budgets_workspace_idx ON budgets (workspace_id) WHERE deleted_at IS NULL;

-- One live budget per category, held by the database. The old app checked
-- this in application code only, so two quick saves could both pass.
CREATE UNIQUE INDEX budgets_one_per_category_idx
    ON budgets (workspace_id, category_id) WHERE deleted_at IS NULL;
