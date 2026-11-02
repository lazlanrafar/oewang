-- Development seed. Idempotent: safe to run repeatedly.
--
-- IDs are fixed rather than generated, so tests and screenshots can refer to
-- them and a reseed does not invalidate a bookmark. They are CUID2-shaped but
-- hand-written; real rows get theirs from the cuid2 crate.
--
-- Creates the default set a new workspace gets (CAT-3), plus a demo user and
-- roughly 200 transactions over three months so list performance and grouping
-- can be judged honestly rather than against an empty table.
--
-- Password for demo@oewang.local is "oewang-dev-password".
-- The hash below is Argon2id; it is a development credential, not a secret.

BEGIN;

INSERT INTO users (id, email, name, password_hash)
VALUES (
    'clxseeduser000000000001',
    'demo@oewang.local',
    'Demo User',
    '$argon2id$v=19$m=19456,t=2,p=1$ZGV2c2VlZHNhbHQxMjM0NQ$Yx8kqFqHhVnqPQ7yJ0mWvLJ3tZB4pZ1nXK5sD9cR2fE'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO workspaces (id, name, slug, country, currency_code)
VALUES ('clxseedwspace00000001', 'Demo Workspace', 'demo', 'ID', 'IDR')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_workspaces (id, workspace_id, user_id, role)
VALUES ('clxseedmember00000001', 'clxseedwspace00000001', 'clxseeduser000000000001', 'owner')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_agent_settings (id, workspace_id)
VALUES ('clxseedagentset000001', 'clxseedwspace00000001')
ON CONFLICT (id) DO NOTHING;

-- The default wallet a new workspace gets. Its currency matches the
-- workspace's, which is what WAL-5 defaults to.
INSERT INTO wallets (id, workspace_id, name, currency_code, balance, is_default, sort_order)
VALUES ('clxseedwallet0000cash', 'clxseedwspace00000001', 'Cash', 'IDR', 0, true, 0)
ON CONFLICT (id) DO NOTHING;

-- A second wallet in another currency, so the multicurrency path is exercised
-- by the seed rather than only by tests.
INSERT INTO wallets (id, workspace_id, name, currency_code, balance, is_default, sort_order)
VALUES ('clxseedwallet0000wise', 'clxseedwspace00000001', 'Wise', 'USD', 0, false, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, workspace_id, name, type, sort_order) VALUES
    ('clxseedcat000000food0', 'clxseedwspace00000001', 'Food',          'expense', 0),
    ('clxseedcat000000trans', 'clxseedwspace00000001', 'Transport',     'expense', 1),
    ('clxseedcat000000shop0', 'clxseedwspace00000001', 'Shopping',      'expense', 2),
    ('clxseedcat000000bills', 'clxseedwspace00000001', 'Bills',         'expense', 3),
    ('clxseedcat000000healt', 'clxseedwspace00000001', 'Health',        'expense', 4),
    ('clxseedcat000000enter', 'clxseedwspace00000001', 'Entertainment', 'expense', 5),
    ('clxseedcat000000otexp', 'clxseedwspace00000001', 'Other',         'expense', 6),
    ('clxseedcat000000salar', 'clxseedwspace00000001', 'Salary',        'income',  0),
    ('clxseedcat000000busin', 'clxseedwspace00000001', 'Business',      'income',  1),
    ('clxseedcat000000gift0', 'clxseedwspace00000001', 'Gift',          'income',  2),
    ('clxseedcat000000otinc', 'clxseedwspace00000001', 'Other',         'income',  3)
ON CONFLICT (id) DO NOTHING;

-- A daily USD to IDR rate for the last 120 days, so the resolution ladder has
-- a cache to fall back on without reaching the network.
INSERT INTO exchange_rates (id, base_code, quote_code, date, rate, source)
SELECT
    'clxseedrate' || to_char(day, 'YYYYMMDD') || '00',
    'USD',
    'IDR',
    day::date,
    16250 + (random() * 300 - 150),
    'api'
FROM generate_series(current_date - 119, current_date, interval '1 day') AS day
ON CONFLICT (base_code, quote_code, date) DO NOTHING;

-- Roughly 200 transactions over three months, mostly expenses, in the Cash
-- wallet. base_rate is 1 because the wallet currency equals the workspace
-- currency, which is resolution step 1 ("same").
INSERT INTO transactions (
    id, workspace_id, wallet_id, category_id, assigned_user_id,
    amount, base_amount, base_rate, base_rate_source, base_rate_date,
    date, type, name, is_ready, source
)
SELECT
    'clxseedtxn' || lpad(n::text, 12, '0'),
    'clxseedwspace00000001',
    'clxseedwallet0000cash',
    (ARRAY[
        'clxseedcat000000food0', 'clxseedcat000000trans', 'clxseedcat000000shop0',
        'clxseedcat000000bills', 'clxseedcat000000healt', 'clxseedcat000000enter'
    ])[1 + (n % 6)],
    'clxseeduser000000000001',
    amount,
    amount,
    1,
    'same',
    txn_date::date,
    txn_date,
    'expense',
    (ARRAY[
        'Warung Tekko', 'Indomaret', 'Gojek', 'Alfamart', 'Starbucks',
        'Tokopedia', 'PLN', 'Apotek K24', 'Bioskop XXI', 'Grab'
    ])[1 + (n % 10)],
    true,
    'web'
FROM generate_series(1, 200) AS n,
LATERAL (
    SELECT (now() - (n % 90) * interval '1 day' - (n % 11) * interval '1 hour') AS txn_date
) AS d,
LATERAL (
    SELECT round((15000 + (n * 7919) % 450000)::numeric, -2) AS amount
) AS a
ON CONFLICT (id) DO NOTHING;

-- Twelve income rows, so totals are not uniformly negative.
INSERT INTO transactions (
    id, workspace_id, wallet_id, category_id, assigned_user_id,
    amount, base_amount, base_rate, base_rate_source, base_rate_date,
    date, type, name, is_ready, source
)
SELECT
    'clxseedinc' || lpad(n::text, 12, '0'),
    'clxseedwspace00000001',
    'clxseedwallet0000cash',
    'clxseedcat000000salar',
    'clxseeduser000000000001',
    9500000,
    9500000,
    1,
    'same',
    txn_date::date,
    txn_date,
    'income',
    'Salary',
    true,
    'web'
FROM generate_series(1, 12) AS n,
LATERAL (SELECT (now() - n * interval '7 day') AS txn_date) AS d
ON CONFLICT (id) DO NOTHING;

-- One foreign-currency expense from the USD wallet, so the three foreign
-- columns and a non-trivial base_rate are present in real data.
INSERT INTO transactions (
    id, workspace_id, wallet_id, category_id, assigned_user_id,
    amount, base_amount, base_rate, base_rate_source, base_rate_date,
    date, type, name, is_ready, source
)
VALUES (
    'clxseedtxnusd00000001',
    'clxseedwspace00000001',
    'clxseedwallet0000wise',
    'clxseedcat000000shop0',
    'clxseeduser000000000001',
    49.99,            -- USD, the wallet currency
    812337.50,        -- IDR, the workspace currency
    16250,
    'cache',
    current_date,
    now() - interval '3 day',
    'expense',
    'Figma',
    true,
    'web'
)
ON CONFLICT (id) DO NOTHING;

-- Balances follow from the rows above rather than being asserted separately,
-- which is the same rule the service follows: a balance is a consequence of
-- transactions, never something written directly.
UPDATE wallets w
SET balance = COALESCE((
    SELECT SUM(CASE t.type WHEN 'income' THEN t.amount ELSE -t.amount END)
    FROM transactions t
    WHERE t.wallet_id = w.id AND t.deleted_at IS NULL
), 0)
WHERE w.workspace_id = 'clxseedwspace00000001';

COMMIT;
