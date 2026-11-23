-- Push notifications to the mobile app (D116, PUSH-1 to PUSH-5).
-- See docs/data-model.md#device_tokens and docs/features/mobile.md#push.

-- A phone that can be pushed to. Belongs to a person, not to a workspace,
-- like a passkey: one device receives pushes for every workspace its owner
-- is in, so these rows are filtered by `user_id`, never by a workspace.
CREATE TABLE device_tokens (
    id           text PRIMARY KEY,
    user_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    platform     text NOT NULL CHECK (platform IN ('ios', 'android')),
    -- The FCM registration token. A credential for pushing to this device,
    -- so it is never logged and never written to an audit row (OPS-3).
    token        text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    -- Refreshed on every registration, which the app repeats on sign-in.
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    -- Set on sign-out, or when FCM reports the token dead.
    deleted_at   timestamptz
);

-- One live row per token. A token registered again, by anyone, moves to
-- that person: the phone changed hands or accounts, and the old owner must
-- stop receiving its pushes.
CREATE UNIQUE INDEX device_tokens_token_idx ON device_tokens (token) WHERE deleted_at IS NULL;
CREATE INDEX device_tokens_user_idx ON device_tokens (user_id) WHERE deleted_at IS NULL;

-- One row per budget, month and threshold that has been announced. The
-- unique key is what makes a threshold push once a month however many
-- transactions race past it; a new month needs no reset. Append-only, like
-- audit_logs: nothing updates or deletes a row.
CREATE TABLE budget_alerts (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    budget_id    text NOT NULL REFERENCES budgets (id) ON DELETE CASCADE,
    -- The month's first day.
    month        date NOT NULL CHECK (extract(day FROM month) = 1),
    threshold    smallint NOT NULL CHECK (threshold IN (80, 100)),
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX budget_alerts_once_idx ON budget_alerts (budget_id, month, threshold);
