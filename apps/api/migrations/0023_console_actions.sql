-- What an operator can do to an account, and the record of it (CSL-5 to
-- CSL-7, CSL-14).

-- Disabled: cannot sign in and every token stops working. Reversible, so a
-- timestamp rather than a delete.
ALTER TABLE users ADD COLUMN disabled_at timestamptz;

-- Suspended: every channel refuses the workspace, its data untouched.
ALTER TABLE workspaces ADD COLUMN suspended_at timestamptz;

-- The console's own audit trail. `audit_logs` requires a workspace and some
-- console actions have none (disabling a user), so operators get a table of
-- their own. Append-only; never updated or deleted.
CREATE TABLE operator_audit (
    id          text PRIMARY KEY,
    operator_id text NOT NULL REFERENCES users (id),
    action      text NOT NULL,
    entity      text NOT NULL,
    entity_id   text NOT NULL,
    before      jsonb,
    after       jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX operator_audit_created_idx ON operator_audit (created_at DESC);
CREATE INDEX operator_audit_entity_idx ON operator_audit (entity, entity_id);
