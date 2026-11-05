//! The AI usage ledger (D92). Append-only: rows are inserted and summed,
//! never updated or deleted.
//!
//! See docs/data-model.md#usage.

use serde::Serialize;
use sqlx::PgExecutor;

#[derive(Debug, Clone, Copy)]
pub struct NewUsage<'a> {
    pub id: &'a str,
    pub workspace_id: &'a str,
    pub user_id: Option<&'a str>,
    pub feature: &'a str,
    pub model: Option<&'a str>,
    pub input_tokens: i32,
    pub output_tokens: i32,
}

pub async fn insert(executor: impl PgExecutor<'_>, usage: NewUsage<'_>) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO ai_usage
             (id, workspace_id, user_id, feature, model, input_tokens, output_tokens)
           VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
        usage.id,
        usage.workspace_id,
        usage.user_id,
        usage.feature,
        usage.model,
        usage.input_tokens,
        usage.output_tokens
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// Token sums for one feature, over all time and since the start of the
/// current calendar month (UTC).
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct FeatureTotals {
    pub feature: String,
    pub month_input: i64,
    pub month_output: i64,
    pub total_input: i64,
    pub total_output: i64,
    pub calls: i64,
}

pub async fn totals_by_feature(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<Vec<FeatureTotals>, sqlx::Error> {
    sqlx::query_as!(
        FeatureTotals,
        r#"SELECT feature,
                  COALESCE(sum(input_tokens) FILTER (
                      WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                  ), 0)::bigint AS "month_input!",
                  COALESCE(sum(output_tokens) FILTER (
                      WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                  ), 0)::bigint AS "month_output!",
                  COALESCE(sum(input_tokens), 0)::bigint AS "total_input!",
                  COALESCE(sum(output_tokens), 0)::bigint AS "total_output!",
                  count(*) AS "calls!"
           FROM ai_usage
           WHERE workspace_id = $1
           GROUP BY feature
           ORDER BY feature"#,
        workspace_id
    )
    .fetch_all(executor)
    .await
}
