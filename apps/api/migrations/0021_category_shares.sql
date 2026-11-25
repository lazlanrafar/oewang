-- Category shares (D123, TXN-24).
--
-- An item with a category other than its transaction's is counted under its
-- own. What is left of the transaction, floored at zero, stays with the
-- transaction's category. One view, so no query applies the rule differently.
--
-- No CTE: a CTE read twice is materialised, and then `transaction_id = $1`
-- from the caller would no longer reach the index on transaction_items.
CREATE VIEW transaction_category_shares AS
SELECT t.workspace_id,
       t.id                AS transaction_id,
       i.category_id,
       false               AS is_own,
       sum(i.amount)       AS amount,
       -- The transaction's own stored ratio, never a new rate (TXN-19).
       round(sum(i.amount) * t.base_amount / t.amount, 4) AS base_amount
FROM transactions t
JOIN transaction_items i ON i.transaction_id = t.id
WHERE t.deleted_at IS NULL
  AND i.deleted_at IS NULL
  AND i.category_id IS NOT NULL
  AND i.category_id IS DISTINCT FROM t.category_id
  -- A discount line is negative and belongs to no category.
  AND i.amount > 0
GROUP BY t.workspace_id, t.id, i.category_id

UNION ALL

SELECT t.workspace_id,
       t.id,
       t.category_id,
       true,
       greatest(t.amount - coalesce(o.amount, 0), 0),
       -- What is left after the rounded shares, so rounding invents nothing.
       greatest(t.base_amount - coalesce(o.base_amount, 0), 0)
FROM transactions t
LEFT JOIN LATERAL (
    SELECT sum(x.amount) AS amount, sum(x.base_amount) AS base_amount
    FROM (
        SELECT sum(i.amount) AS amount,
               round(sum(i.amount) * t.base_amount / t.amount, 4) AS base_amount
        FROM transaction_items i
        WHERE i.transaction_id = t.id
          AND i.deleted_at IS NULL
          AND i.category_id IS NOT NULL
          AND i.category_id IS DISTINCT FROM t.category_id
          AND i.amount > 0
        GROUP BY i.category_id
    ) x
) o ON true
WHERE t.deleted_at IS NULL;
