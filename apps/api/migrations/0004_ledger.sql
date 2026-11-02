-- The ledger. See docs/data-model.md#ledger and #multicurrency.

CREATE TABLE transactions (
    id                     text PRIMARY KEY,
    workspace_id           text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    wallet_id              text NOT NULL REFERENCES wallets (id) ON DELETE CASCADE,
    to_wallet_id           text REFERENCES wallets (id) ON DELETE SET NULL,
    category_id            text REFERENCES categories (id) ON DELETE SET NULL,
    assigned_user_id       text REFERENCES users (id) ON DELETE SET NULL,

    -- In the source wallet's currency. This is what moves that balance (TXN-2).
    amount                 numeric(19, 4) NOT NULL CHECK (amount > 0),
    -- In the destination wallet's currency. Transfers only (TXN-18).
    to_amount              numeric(19, 4) CHECK (to_amount IS NULL OR to_amount > 0),

    -- What the user typed, when its currency differed from the wallet's.
    original_amount        numeric(19, 4),
    original_currency_code text,
    exchange_rate          numeric(19, 8),

    -- amount converted to the workspace currency, computed at write time.
    -- Every report sums this column and never converts at read time (TXN-19).
    base_amount            numeric(19, 4) NOT NULL,
    base_rate              numeric(19, 8) NOT NULL,
    base_rate_source       text NOT NULL CHECK (
                               base_rate_source IN ('same', 'user', 'live', 'cache')
                           ),
    base_rate_date         date NOT NULL,

    date                   timestamptz NOT NULL,
    type                   text NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    name                   text,
    description            text,
    is_ready               boolean NOT NULL DEFAULT false,
    is_exported            boolean NOT NULL DEFAULT false,
    source                 text NOT NULL DEFAULT 'web' CHECK (
                               source IN ('web', 'chat', 'import', 'receipt')
                           ),
    -- Set on imported and receipt rows only. Null for manual and chat entry,
    -- where two identical expenses on purpose are legitimate (TXN-16).
    fingerprint            text,

    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    deleted_at             timestamptz,

    -- A transfer has a destination and a destination amount; nothing else does
    -- (TXN-7, TXN-18). The service checks this too, with a specific error code;
    -- the constraint is here so a bug cannot write a shape that cannot exist.
    CONSTRAINT transactions_transfer_shape CHECK (
        (type = 'transfer' AND to_wallet_id IS NOT NULL AND to_amount IS NOT NULL
             AND to_wallet_id <> wallet_id)
        OR
        (type <> 'transfer' AND to_wallet_id IS NULL AND to_amount IS NULL)
    ),

    -- The three foreign-entry columns travel together or not at all.
    CONSTRAINT transactions_foreign_entry_shape CHECK (
        (original_amount IS NULL AND original_currency_code IS NULL AND exchange_rate IS NULL)
        OR
        (original_amount IS NOT NULL AND original_currency_code IS NOT NULL
             AND exchange_rate IS NOT NULL)
    )
);

-- Covers every list and summary query: workspace scope, live rows, date sort.
-- Carried over unchanged from the old app, where it was tuned against the
-- real query shape.
CREATE INDEX transactions_workspace_date_idx
    ON transactions (workspace_id, date DESC, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX transactions_wallet_id_idx ON transactions (wallet_id);
CREATE INDEX transactions_category_id_idx ON transactions (category_id);

-- Re-importing the same statement becomes a no-op instead of a doubled
-- ledger, enforced by the database rather than by a dialog (TXN-16, D29).
-- Partial on deleted_at, so deleting an imported row makes it importable again.
CREATE UNIQUE INDEX transactions_fingerprint_idx
    ON transactions (workspace_id, fingerprint)
    WHERE fingerprint IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE transaction_items (
    id             text PRIMARY KEY,
    workspace_id   text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    transaction_id text NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
    name           text NOT NULL,
    brand          text,
    quantity       numeric(10, 3),
    unit           text,
    unit_price     numeric(19, 4),
    amount         numeric(19, 4) NOT NULL,
    category_id    text REFERENCES categories (id) ON DELETE SET NULL,
    notes          text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    deleted_at     timestamptz
);

CREATE INDEX transaction_items_transaction_idx
    ON transaction_items (transaction_id) WHERE deleted_at IS NULL;
CREATE INDEX transaction_items_workspace_idx ON transaction_items (workspace_id);

CREATE TABLE transaction_attachments (
    id             text PRIMARY KEY,
    workspace_id   text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    transaction_id text NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
    vault_file_id  text NOT NULL REFERENCES vault_files (id) ON DELETE CASCADE,
    created_at     timestamptz NOT NULL DEFAULT now(),
    deleted_at     timestamptz
);

CREATE INDEX transaction_attachments_transaction_idx
    ON transaction_attachments (transaction_id) WHERE deleted_at IS NULL;

CREATE TABLE transaction_import_jobs (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    user_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status       text NOT NULL DEFAULT 'pending' CHECK (
                     status IN ('pending', 'succeeded', 'failed')
                 ),
    imported     integer,
    -- Rows that failed validation.
    skipped      integer,
    -- Rows whose fingerprint already existed (TXN-16).
    duplicates   integer,
    error        text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transaction_import_jobs_workspace_idx
    ON transaction_import_jobs (workspace_id, id);

-- A daily rate cache. Not workspace-scoped: a rate is a fact about the world,
-- not about a tenant. Filled from exchangerate.host (D44). It only ever
-- prefills a form or resolves a rate at write time; no report path reads it.
CREATE TABLE exchange_rates (
    id         text PRIMARY KEY,
    base_code  text NOT NULL,
    quote_code text NOT NULL,
    date       date NOT NULL,
    rate       numeric(19, 8) NOT NULL CHECK (rate > 0),
    source     text NOT NULL DEFAULT 'api' CHECK (source IN ('api', 'manual')),
    fetched_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX exchange_rates_pair_date_idx
    ON exchange_rates (base_code, quote_code, date);

-- Resolution step 4 reaches for the newest cached rate for a pair.
CREATE INDEX exchange_rates_pair_recent_idx
    ON exchange_rates (base_code, quote_code, date DESC);
