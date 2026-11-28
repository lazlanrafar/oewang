//! The plan a workspace holds (PLN-2, D128), as the checks that limit a
//! workspace read it. The console's plan management lives in `console.rs`.

use oewang_domain::Feature;
use sqlx::PgExecutor;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspacePlan {
    pub plan_id: String,
    pub name: String,
    /// Null is unlimited.
    pub max_tokens_month: Option<i64>,
    pub max_storage_bytes: Option<i64>,
    pub features: Vec<Feature>,
}

/// The live workspace's plan, none when the workspace is unknown or deleted.
pub async fn workspace_plan(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<Option<WorkspacePlan>, sqlx::Error> {
    let row = sqlx::query!(
        r#"SELECT p.id, p.name, p.max_tokens_month, p.max_storage_bytes,
                  COALESCE((SELECT array_agg(f.feature ORDER BY f.feature)
                              FROM plan_features f WHERE f.plan_id = p.id), '{}') AS "features!"
             FROM workspaces w
             JOIN plans p ON p.id = w.plan_id AND p.deleted_at IS NULL
            WHERE w.id = $1 AND w.deleted_at IS NULL"#,
        workspace_id
    )
    .fetch_optional(executor)
    .await?;
    Ok(row.map(|row| WorkspacePlan {
        plan_id: row.id,
        name: row.name,
        max_tokens_month: row.max_tokens_month,
        max_storage_bytes: row.max_storage_bytes,
        // The CHECK on plan_features.feature holds exactly the enum's keys.
        features: row
            .features
            .iter()
            .filter_map(|key| Feature::parse(key))
            .collect(),
    }))
}
