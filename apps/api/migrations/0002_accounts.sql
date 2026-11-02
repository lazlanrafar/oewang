-- Wallets, wallet groups and categories.
-- See docs/data-model.md#accounts.

CREATE TABLE wallet_groups (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    name         text NOT NULL,
    sort_order   integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz
);

CREATE INDEX wallet_groups_workspace_idx
    ON wallet_groups (workspace_id) WHERE deleted_at IS NULL;

CREATE TABLE wallets (
    id                    text PRIMARY KEY,
    workspace_id          text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    group_id              text REFERENCES wallet_groups (id) ON DELETE SET NULL,
    name                  text NOT NULL,
    -- Defaults to the workspace currency; the service fills it (WAL-5).
    -- Locked once the wallet has a live transaction (WAL-6).
    currency_code         text NOT NULL,
    -- In this wallet's own currency, not the workspace currency (WAL-2).
    balance               numeric(19, 4) NOT NULL DEFAULT 0,
    is_included_in_totals boolean NOT NULL DEFAULT true,
    is_default            boolean NOT NULL DEFAULT false,
    sort_order            integer NOT NULL DEFAULT 0,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    deleted_at            timestamptz
);

CREATE INDEX wallets_workspace_idx ON wallets (workspace_id) WHERE deleted_at IS NULL;

-- WAL-3 enforced by the database, not only by the service. The old app
-- enforced "exactly one default" in application code alone.
CREATE UNIQUE INDEX wallets_one_default_idx
    ON wallets (workspace_id) WHERE is_default AND deleted_at IS NULL;

CREATE TABLE categories (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    name         text NOT NULL,
    type         text NOT NULL CHECK (type IN ('income', 'expense')),
    sort_order   integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz
);

CREATE INDEX categories_workspace_idx
    ON categories (workspace_id) WHERE deleted_at IS NULL;
