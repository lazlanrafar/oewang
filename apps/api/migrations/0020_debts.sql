-- Debts and contacts (D120, D121). See docs/data-model.md#debts.
--
-- A debt is money owed between the person and one contact. Payments bring
-- `remaining_amount` to zero. It and `status` are stored, not summed per
-- read, because the list filters and sorts on them; only the debt service
-- writes them, inside the transaction of the payment that moves them.

-- The old app's address, VAT, website and billing columns served invoices,
-- which stay out.
CREATE TABLE contacts (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    email        text,
    phone        text,
    note         text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz
);

CREATE INDEX contacts_workspace_idx ON contacts (workspace_id) WHERE deleted_at IS NULL;
-- For the case-insensitive match chat, MCP and split bill use. Not unique:
-- two people can share a name, and merge fixes a typo (CON-4).
CREATE INDEX contacts_name_idx
    ON contacts (workspace_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE debts (
    id                    text PRIMARY KEY,
    workspace_id          text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    contact_id            text NOT NULL REFERENCES contacts (id),
    -- Soft-deleting the source clears this in the same transaction (D121).
    source_transaction_id text REFERENCES transactions (id),
    type                  text NOT NULL CHECK (type IN ('payable', 'receivable')),
    origin                text NOT NULL DEFAULT 'manual'
                          CHECK (origin IN ('manual', 'from_transaction')),
    currency_code         text NOT NULL,
    amount                numeric(19, 4) NOT NULL CHECK (amount > 0),
    remaining_amount      numeric(19, 4) NOT NULL,
    status                text NOT NULL DEFAULT 'unpaid'
                          CHECK (status IN ('unpaid', 'partial', 'paid')),
    description           text,
    -- A date, not an instant: overdue compares it with the person's day.
    due_date              date,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    deleted_at            timestamptz,
    CHECK (remaining_amount >= 0 AND remaining_amount <= amount),
    CHECK ((status = 'paid') = (remaining_amount = 0)),
    CHECK ((status = 'unpaid') = (remaining_amount = amount))
);

CREATE INDEX debts_workspace_idx ON debts (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX debts_contact_id_idx ON debts (contact_id);
CREATE INDEX debts_source_transaction_id_idx ON debts (source_transaction_id);

CREATE TABLE debt_payments (
    id             text PRIMARY KEY,
    workspace_id   text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    debt_id        text NOT NULL REFERENCES debts (id),
    -- Null when paid without a wallet.
    transaction_id text REFERENCES transactions (id),
    -- In the debt's currency, whatever the wallet's.
    amount         numeric(19, 4) NOT NULL CHECK (amount > 0),
    date           timestamptz NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    deleted_at     timestamptz
);

CREATE INDEX debt_payments_debt_id_idx ON debt_payments (debt_id);
-- One payment per transaction, which is what lets deleting that
-- transaction find the one payment it cancels (D121).
CREATE UNIQUE INDEX debt_payments_transaction_idx
    ON debt_payments (transaction_id)
    WHERE transaction_id IS NOT NULL AND deleted_at IS NULL;
