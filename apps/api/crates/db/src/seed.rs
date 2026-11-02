//! Defaults a new workspace gets (CAT-3).
//!
//! Written here rather than in a service because the same set is needed by
//! registration, by the development seed and by tests, and a second copy
//! would drift from the first.

use sqlx::PgConnection;

/// `(name, type)`, in display order.
pub const DEFAULT_CATEGORIES: &[(&str, &str)] = &[
    ("Food", "expense"),
    ("Transport", "expense"),
    ("Shopping", "expense"),
    ("Bills", "expense"),
    ("Health", "expense"),
    ("Entertainment", "expense"),
    ("Other", "expense"),
    ("Salary", "income"),
    ("Business", "income"),
    ("Gift", "income"),
    ("Other", "income"),
];

pub const DEFAULT_WALLET_NAME: &str = "Cash";

/// One default wallet, the category set, and the agent settings row.
///
/// Runs inside the caller's transaction, so a workspace is never left half
/// seeded.
pub async fn seed_workspace(
    connection: &mut PgConnection,
    workspace_id: &str,
    currency_code: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO wallets (id, workspace_id, name, currency_code, is_default, sort_order)
           VALUES ($1, $2, $3, $4, true, 0)"#,
        cuid2::create_id(),
        workspace_id,
        DEFAULT_WALLET_NAME,
        currency_code
    )
    .execute(&mut *connection)
    .await?;

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
