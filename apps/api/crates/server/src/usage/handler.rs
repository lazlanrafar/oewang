//! `GET /v1/workspaces/current/usage` (USG-3).

use axum::{extract::State, Json};
use oewang_db::repositories::{usage, vault};
use oewang_domain::{AppError, Envelope};
use serde::Serialize;

use crate::{
    auth::extractor::Auth,
    response::{ApiError, RequestId},
    state::AppState,
};

#[derive(Debug, Serialize)]
pub struct UsageView {
    pub storage: vault::StorageUsage,
    pub ai: AiUsageView,
}

#[derive(Debug, Serialize, Default)]
pub struct Tokens {
    pub input: i64,
    pub output: i64,
}

#[derive(Debug, Serialize)]
pub struct FeatureView {
    pub feature: String,
    pub month: Tokens,
    pub total: Tokens,
    pub calls: i64,
}

#[derive(Debug, Serialize)]
pub struct AiUsageView {
    /// Since the first day of the current calendar month, UTC.
    pub month: Tokens,
    pub total: Tokens,
    pub by_feature: Vec<FeatureView>,
}

pub async fn get(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<UsageView>>, ApiError> {
    let id = request_id.0;

    let result = async {
        let storage = vault::storage_usage(&state.db, &auth.workspace_id)
            .await
            .map_err(internal)?;
        let rows = usage::totals_by_feature(&state.db, &auth.workspace_id)
            .await
            .map_err(internal)?;
        Ok::<_, AppError>(UsageView {
            storage,
            ai: summarize(rows),
        })
    }
    .await;

    match result {
        Ok(view) => Ok(Json(Envelope::data(view, id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

/// The per-feature rows, and their sums. Added up here rather than in a
/// second query so the headline and the table cannot disagree.
fn summarize(rows: Vec<usage::FeatureTotals>) -> AiUsageView {
    let mut month = Tokens::default();
    let mut total = Tokens::default();

    let by_feature = rows
        .into_iter()
        .map(|row| {
            month.input += row.month_input;
            month.output += row.month_output;
            total.input += row.total_input;
            total.output += row.total_output;
            FeatureView {
                feature: row.feature,
                month: Tokens {
                    input: row.month_input,
                    output: row.month_output,
                },
                total: Tokens {
                    input: row.total_input,
                    output: row.total_output,
                },
                calls: row.calls,
            }
        })
        .collect();

    AiUsageView {
        month,
        total,
        by_feature,
    }
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(feature: &str, month: (i64, i64), total: (i64, i64)) -> usage::FeatureTotals {
        usage::FeatureTotals {
            feature: feature.into(),
            month_input: month.0,
            month_output: month.1,
            total_input: total.0,
            total_output: total.1,
            calls: 1,
        }
    }

    #[test]
    fn should_sum_the_features_into_the_headline() {
        let view = summarize(vec![
            row("chat", (10, 2), (30, 6)),
            row("receipt", (5, 1), (5, 1)),
        ]);
        assert_eq!((view.month.input, view.month.output), (15, 3));
        assert_eq!((view.total.input, view.total.output), (35, 7));
        assert_eq!(view.by_feature.len(), 2);
    }
}
