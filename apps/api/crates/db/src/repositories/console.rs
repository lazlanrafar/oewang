//! The operator console (CSL). Reads across workspaces by design, so these
//! queries filter by `deleted_at` but not by `workspace_id`
//! (docs/data-model.md#console_roles).

use sqlx::PgExecutor;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OperatorRow {
    pub user_id: String,
    pub email: String,
    pub name: Option<String>,
    pub role_id: String,
    pub role_name: String,
    /// Keys as stored; the service parses them.
    pub permissions: Vec<String>,
}

/// The user's console role and its permissions, or none when they are not
/// an operator or their role was deleted.
pub async fn find_operator(
    executor: impl PgExecutor<'_>,
    user_id: &str,
) -> Result<Option<OperatorRow>, sqlx::Error> {
    sqlx::query_as!(
        OperatorRow,
        r#"SELECT u.id AS user_id, u.email, u.name,
                  r.id AS role_id, r.name AS role_name,
                  COALESCE(
                      array_agg(p.permission ORDER BY p.permission)
                          FILTER (WHERE p.permission IS NOT NULL),
                      '{}'
                  ) AS "permissions!"
           FROM users u
           JOIN console_roles r ON r.id = u.console_role_id AND r.deleted_at IS NULL
           LEFT JOIN console_role_permissions p ON p.role_id = r.id
           WHERE u.id = $1
           GROUP BY u.id, r.id"#,
        user_id
    )
    .fetch_optional(executor)
    .await
}
