-- The colours a user sees income and expense in (D100). Per user, not per
-- workspace: it is how one person reads figures, and a member choosing red
-- for income should not repaint everybody else's ledger. Null means the
-- product's default. Stored as `#rrggbb`, lowercase, which is also the only
-- shape the app ever writes into a style attribute.
ALTER TABLE users
    ADD COLUMN income_color  text CHECK (income_color ~ '^#[0-9a-f]{6}$'),
    ADD COLUMN expense_color text CHECK (expense_color ~ '^#[0-9a-f]{6}$');
