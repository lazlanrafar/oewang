-- Bring existing workspaces onto the old app's default categories (D102).
--
-- New workspaces get the 31 defaults from `crates/db/src/seed.rs`. The ones
-- that already existed were seeded with eleven placeholders. For each live
-- workspace with an owner:
--
-- 1. A placeholder that no live transaction or line item uses is retired
--    (soft delete, OPS-2). One that is used stays, because removing it
--    would strip a category off someone's rows. "Other" is never retired:
--    the new list has it too.
-- 2. Every default the workspace does not already hold, by exact name and
--    type, is added, in the seed's order.
-- 3. "Other" is moved to the end of its type, so it stays last whatever
--    was kept or added.
--
-- Every change writes an audit row inside this transaction (D14, OPS-1),
-- attributed to the workspace's owner with source `migration`, a value
-- the audit table accepts from here on.

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_source_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_source_check
    CHECK (source IN ('web', 'chat', 'import', 'receipt', 'telegram', 'migration'));

-- Generated from DEFAULT_CATEGORIES in crates/db/src/seed.rs.
CREATE TEMP TABLE new_defaults (position integer, name text, type text) ON COMMIT DROP;
INSERT INTO new_defaults (position, name, type) VALUES
    (0, '💵 Salary', 'income'),
    (1, '💰 Allowance', 'income'),
    (2, '💵 Petty cash', 'income'),
    (3, '🏅 Bonus', 'income'),
    (4, '🐒 Chip in', 'income'),
    (5, '💰 Freelance', 'income'),
    (6, 'Other', 'income'),
    (7, '🍜 Food', 'expense'),
    (8, '🧑‍🤝‍🧑 Social Life', 'expense'),
    (9, '🐶 Pets', 'expense'),
    (10, '🚕 Transport', 'expense'),
    (11, '🪑 Household', 'expense'),
    (12, '🧥 Apparel', 'expense'),
    (13, '💄 Beauty', 'expense'),
    (14, '🧘 Health', 'expense'),
    (15, '📙 Education', 'expense'),
    (16, '🎁 Gift', 'expense'),
    (17, '⚽ Sport', 'expense'),
    (18, '🧣 Laundry', 'expense'),
    (19, '☕ Coffee', 'expense'),
    (20, '💹 Investment', 'expense'),
    (21, '🏡 Rent', 'expense'),
    (22, '💸 Subscription', 'expense'),
    (23, '🛵 Motorbikes', 'expense'),
    (24, '🤖 Hobby', 'expense'),
    (25, '💳 Credit', 'expense'),
    (26, '📶 Internet', 'expense'),
    (27, '🏡 Parents', 'expense'),
    (28, '📚 Hobby', 'expense'),
    (29, '💵 Salary', 'expense'),
    (30, 'Other', 'expense');

-- The eleven placeholders, less "Other".
CREATE TEMP TABLE placeholder_defaults (name text, type text) ON COMMIT DROP;
INSERT INTO placeholder_defaults (name, type) VALUES
    ('Food', 'expense'),
    ('Transport', 'expense'),
    ('Shopping', 'expense'),
    ('Bills', 'expense'),
    ('Health', 'expense'),
    ('Entertainment', 'expense'),
    ('Salary', 'income'),
    ('Business', 'income'),
    ('Gift', 'income');

-- One owner per live workspace, the longest-standing, to attribute the
-- audit rows to. A workspace without an owner is left alone.
CREATE TEMP TABLE workspace_owner ON COMMIT DROP AS
SELECT DISTINCT ON (m.workspace_id) m.workspace_id, m.user_id
FROM user_workspaces m
JOIN workspaces w ON w.id = m.workspace_id AND w.deleted_at IS NULL
WHERE m.role = 'owner' AND m.deleted_at IS NULL
ORDER BY m.workspace_id, m.joined_at, m.id;

-- 1. Retire unused placeholders.
WITH retired AS (
    UPDATE categories c
    SET deleted_at = now(), updated_at = now()
    FROM workspace_owner o, placeholder_defaults p
    WHERE c.workspace_id = o.workspace_id
      AND c.deleted_at IS NULL
      AND c.name = p.name
      AND c.type = p.type
      AND NOT EXISTS (
          SELECT 1 FROM transactions t
          WHERE t.category_id = c.id AND t.deleted_at IS NULL
      )
      AND NOT EXISTS (
          SELECT 1 FROM transaction_items i
          WHERE i.category_id = c.id AND i.deleted_at IS NULL
      )
    RETURNING c.id, c.workspace_id, c.name, c.type, c.sort_order
)
INSERT INTO audit_logs (id, workspace_id, user_id, action, entity, entity_id, before, after, source)
SELECT replace(gen_random_uuid()::text, '-', ''), r.workspace_id, o.user_id,
       'category.deleted', 'category', r.id,
       jsonb_build_object('id', r.id, 'name', r.name, 'type', r.type, 'sort_order', r.sort_order),
       NULL, 'migration'
FROM retired r
JOIN workspace_owner o ON o.workspace_id = r.workspace_id;

-- 2. Add the defaults each workspace lacks.
WITH added AS (
    INSERT INTO categories (id, workspace_id, name, type, sort_order)
    SELECT replace(gen_random_uuid()::text, '-', ''), o.workspace_id, d.name, d.type, d.position
    FROM workspace_owner o
    CROSS JOIN new_defaults d
    WHERE NOT EXISTS (
        SELECT 1 FROM categories c
        WHERE c.workspace_id = o.workspace_id
          AND c.deleted_at IS NULL
          AND c.type = d.type
          AND c.name = d.name
    )
    RETURNING id, workspace_id, name, type, sort_order
)
INSERT INTO audit_logs (id, workspace_id, user_id, action, entity, entity_id, before, after, source)
SELECT replace(gen_random_uuid()::text, '-', ''), a.workspace_id, o.user_id,
       'category.created', 'category', a.id,
       NULL,
       jsonb_build_object('id', a.id, 'name', a.name, 'type', a.type, 'sort_order', a.sort_order),
       'migration'
FROM added a
JOIN workspace_owner o ON o.workspace_id = a.workspace_id;

-- 3. "Other" last in its type. A tie is not last: the list breaks ties by
--    name, and "Other" sorts before an emoji.
WITH target AS (
    SELECT c.id, c.workspace_id, c.name, c.type, c.sort_order AS before_order,
           (SELECT COALESCE(max(x.sort_order), -1) + 1
            FROM categories x
            WHERE x.workspace_id = c.workspace_id
              AND x.type = c.type
              AND x.deleted_at IS NULL
              AND x.id <> c.id) AS after_order
    FROM categories c
    JOIN workspace_owner o ON o.workspace_id = c.workspace_id
    WHERE c.deleted_at IS NULL AND c.name = 'Other'
),
moved AS (
    UPDATE categories c
    SET sort_order = t.after_order, updated_at = now()
    FROM target t
    WHERE c.id = t.id AND t.after_order > t.before_order
    RETURNING c.id, c.workspace_id, t.name, t.type, t.before_order, t.after_order
)
INSERT INTO audit_logs (id, workspace_id, user_id, action, entity, entity_id, before, after, source)
SELECT replace(gen_random_uuid()::text, '-', ''), m.workspace_id, o.user_id,
       'category.updated', 'category', m.id,
       jsonb_build_object('id', m.id, 'name', m.name, 'type', m.type, 'sort_order', m.before_order),
       jsonb_build_object('id', m.id, 'name', m.name, 'type', m.type, 'sort_order', m.after_order),
       'migration'
FROM moved m
JOIN workspace_owner o ON o.workspace_id = m.workspace_id;
