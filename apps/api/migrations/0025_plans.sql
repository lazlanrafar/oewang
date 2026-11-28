-- Plans: what a workspace may use (PLN-1, PLN-2, D128).
--
-- Not workspace-scoped: a plan belongs to no workspace, and many workspaces
-- hold one, so these queries filter by `deleted_at` and never by
-- `workspace_id` (docs/data-model.md#plans-plan_features). This migration
-- records which plan a workspace holds; nothing reads it to refuse yet.
CREATE TABLE plans (
    id                text PRIMARY KEY,
    name              text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
    -- Null is unlimited. Tokens are input plus output over a calendar month
    -- in UTC, the usage page's month.
    max_tokens_month  bigint CHECK (max_tokens_month >= 0),
    max_storage_bytes bigint CHECK (max_storage_bytes >= 0),
    -- The plan every workspace holds unless given another. Seeded here and
    -- never edited or deleted, as the system console role is.
    is_system         boolean NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz
);

CREATE UNIQUE INDEX plans_name_idx ON plans (lower(name)) WHERE deleted_at IS NULL;

-- A link table like `console_role_permissions`: changing a plan's features
-- replaces its rows, and the change is kept in the operator audit. The keys
-- are `Feature` in the domain crate.
CREATE TABLE plan_features (
    plan_id text NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
    feature text NOT NULL CHECK (feature IN (
        'chat',
        'telegram',
        'receipt_scan',
        'statement_import',
        'mcp',
        'vault'
    )),
    PRIMARY KEY (plan_id, feature)
);

-- Free ships unlimited with every feature, so the deploy that starts
-- enforcing blocks nobody (D128).
INSERT INTO plans (id, name, is_system) VALUES ('free', 'Free', true);

INSERT INTO plan_features (plan_id, feature) VALUES
    ('free', 'chat'),
    ('free', 'telegram'),
    ('free', 'receipt_scan'),
    ('free', 'statement_import'),
    ('free', 'mcp'),
    ('free', 'vault');

-- The default fills every existing row and every workspace created later,
-- whichever code path inserts it.
ALTER TABLE workspaces
    ADD COLUMN plan_id text NOT NULL DEFAULT 'free' REFERENCES plans (id);

CREATE INDEX workspaces_plan_idx ON workspaces (plan_id);

-- The permission that manages plans, held by the owner role like every
-- other management permission (D125).
ALTER TABLE console_role_permissions
    DROP CONSTRAINT console_role_permissions_permission_check,
    ADD CONSTRAINT console_role_permissions_permission_check CHECK (permission IN (
        'console.read',
        'console.feedback.write',
        'console.users.disable',
        'console.workspaces.suspend',
        'console.workspaces.restore',
        'console.operators.manage',
        'console.roles.manage',
        'console.audit.read',
        'console.plans.manage'
    ));

INSERT INTO console_role_permissions (role_id, permission) VALUES
    ('owner', 'console.plans.manage');
