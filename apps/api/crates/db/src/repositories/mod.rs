pub mod accounts;
pub mod ai;
pub mod audit;
pub mod budgets;
pub mod categories;
pub mod feedback;
pub mod fx;
pub mod items;
pub mod mcp;
pub mod passkeys;
pub mod receipts;
pub mod telegram;
pub mod tokens;
pub mod transactions;
pub mod usage;
pub mod vault;
pub mod wallets;

/// A search term as an `ILIKE` pattern that matches it anywhere.
///
/// `%`, `_` and `\` typed by a user are literal characters, not wildcards.
pub(crate) fn contains_pattern(search: &str) -> String {
    format!(
        "%{}%",
        search
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    )
}
