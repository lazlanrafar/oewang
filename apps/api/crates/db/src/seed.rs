//! Defaults a new workspace gets (CAT-3).
//!
//! Written here rather than in a service because the same set is needed by
//! registration, by the development seed and by tests, and a second copy
//! would drift from the first.

use sqlx::PgConnection;

/// `(name, type)`, in display order: income first, then expense, as the old
/// app inserted them.
///
/// Copied verbatim from the old app's `packages/constants/src/default/
/// category.ts`, emoji included, so a new workspace starts with the list its
/// users already know (D102). Two entries look like duplicates and are
/// kept, because they are in the source: "🤖 Hobby" and "📚 Hobby" are
/// distinct names, and "💵 Salary" appears under expense as well as income,
/// for salaries paid out.
pub const DEFAULT_CATEGORIES: &[(&str, &str)] = &[
    ("💵 Salary", "income"),
    ("💰 Allowance", "income"),
    ("💵 Petty cash", "income"),
    ("🏅 Bonus", "income"),
    ("🐒 Chip in", "income"),
    ("💰 Freelance", "income"),
    ("Other", "income"),
    ("🍜 Food", "expense"),
    ("🧑‍🤝‍🧑 Social Life", "expense"),
    ("🐶 Pets", "expense"),
    ("🚕 Transport", "expense"),
    ("🪑 Household", "expense"),
    ("🧥 Apparel", "expense"),
    ("💄 Beauty", "expense"),
    ("🧘 Health", "expense"),
    ("📙 Education", "expense"),
    ("🎁 Gift", "expense"),
    ("⚽ Sport", "expense"),
    ("🧣 Laundry", "expense"),
    ("☕ Coffee", "expense"),
    ("💹 Investment", "expense"),
    ("🏡 Rent", "expense"),
    ("💸 Subscription", "expense"),
    ("🛵 Motorbikes", "expense"),
    ("🤖 Hobby", "expense"),
    ("💳 Credit", "expense"),
    ("📶 Internet", "expense"),
    ("🏡 Parents", "expense"),
    ("📚 Hobby", "expense"),
    ("💵 Salary", "expense"),
    ("Other", "expense"),
];

/// The wallet groups, in display order, from the old app's
/// `packages/constants/src/default/wallet.ts` (D102).
pub const DEFAULT_WALLET_GROUPS: &[&str] = &[
    "Cash",
    "Accounts",
    "Card",
    "Debit Card",
    "Savings",
    "Top-Up / Prepaid",
    "Investments",
    "Overdrafts",
    "Loan",
    "Insurance",
    "Others",
];

/// `(wallet name, group name)`, in display order, each at balance zero and
/// counted in totals, as the old app made them. The first is the default
/// wallet (WAL-3).
pub const DEFAULT_WALLETS: &[(&str, &str)] =
    &[("Cash", "Cash"), ("Accounts", "Accounts"), ("Card", "Card")];

pub const DEFAULT_WALLET_NAME: &str = DEFAULT_WALLETS[0].0;

/// The wallet groups and wallets, the category set, and the agent settings
/// row.
///
/// Runs inside the caller's transaction, so a workspace is never left half
/// seeded.
pub async fn seed_workspace(
    connection: &mut PgConnection,
    workspace_id: &str,
    currency_code: &str,
) -> Result<(), sqlx::Error> {
    let mut group_ids = Vec::with_capacity(DEFAULT_WALLET_GROUPS.len());
    for (index, name) in DEFAULT_WALLET_GROUPS.iter().enumerate() {
        let id = cuid2::create_id();
        sqlx::query!(
            r#"INSERT INTO wallet_groups (id, workspace_id, name, sort_order)
               VALUES ($1, $2, $3, $4)"#,
            id,
            workspace_id,
            name,
            index as i32
        )
        .execute(&mut *connection)
        .await?;
        group_ids.push((*name, id));
    }

    for (index, (name, group)) in DEFAULT_WALLETS.iter().enumerate() {
        let group_id = group_ids
            .iter()
            .find(|(group_name, _)| group_name == group)
            .map(|(_, id)| id.as_str());
        sqlx::query!(
            r#"INSERT INTO wallets
                   (id, workspace_id, group_id, name, currency_code, is_default, sort_order)
               VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
            cuid2::create_id(),
            workspace_id,
            group_id,
            name,
            currency_code,
            index == 0,
            index as i32
        )
        .execute(&mut *connection)
        .await?;
    }

    for (index, (name, kind)) in DEFAULT_CATEGORIES.iter().enumerate() {
        sqlx::query!(
            r#"INSERT INTO categories (id, workspace_id, name, type, sort_order)
               VALUES ($1, $2, $3, $4, $5)"#,
            cuid2::create_id(),
            workspace_id,
            name,
            kind,
            index as i32
        )
        .execute(&mut *connection)
        .await?;
    }

    sqlx::query!(
        r#"INSERT INTO ai_agent_settings (id, workspace_id) VALUES ($1, $2)"#,
        cuid2::create_id(),
        workspace_id
    )
    .execute(&mut *connection)
    .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::DEFAULT_CATEGORIES;

    #[test]
    fn should_carry_the_old_apps_list() {
        let count = |kind: &str| {
            DEFAULT_CATEGORIES
                .iter()
                .filter(|(_, k)| *k == kind)
                .count()
        };
        assert_eq!(count("income"), 7);
        assert_eq!(count("expense"), 24);
        assert!(DEFAULT_CATEGORIES
            .iter()
            .all(|(_, kind)| *kind == "income" || *kind == "expense"));
    }

    #[test]
    fn should_put_every_default_wallet_in_a_default_group() {
        use super::{DEFAULT_WALLETS, DEFAULT_WALLET_GROUPS, DEFAULT_WALLET_NAME};

        assert_eq!(DEFAULT_WALLET_GROUPS.len(), 11);
        assert!(DEFAULT_WALLETS
            .iter()
            .all(|(_, group)| DEFAULT_WALLET_GROUPS.contains(group)));
        assert_eq!(DEFAULT_WALLET_NAME, "Cash", "the default wallet");
    }

    /// An emoji, one space, then the word; or the word alone. No double or
    /// trailing space, and the word starts with a capital, so a name never
    /// reads "🍜Food" or "🍜  food".
    #[test]
    fn should_write_each_name_as_emoji_space_word() {
        for (name, _) in DEFAULT_CATEGORIES {
            assert_eq!(*name, name.trim(), "{name:?}");
            assert!(!name.contains("  "), "{name:?}");
            let word = match name.split_once(' ') {
                Some((prefix, rest)) if !prefix.is_ascii() => rest,
                _ => name,
            };
            assert!(
                word.is_ascii(),
                "{name:?}: an emoji without a space after it"
            );
            assert!(
                word.starts_with(|c: char| c.is_ascii_uppercase()),
                "{name:?}"
            );
        }
    }

    #[test]
    fn should_end_each_type_with_other() {
        for kind in ["income", "expense"] {
            let last = DEFAULT_CATEGORIES.iter().rfind(|(_, k)| *k == kind);
            assert_eq!(last.map(|(name, _)| *name), Some("Other"));
        }
    }
}
