//! The one check that a workspace's plan includes a feature (PLN-6, D128).
//!
//! Every entry point that starts something a plan can leave out calls
//! `require` before it does any work: before the AI service is asked,
//! before an upload starts, before a Telegram message is acted on. Which
//! entry point checks which feature is docs/features/plans.md#features.
//!
//! The plan is read per request, never from the token or a cache, so an
//! operator's change applies on the caller's next request.

use oewang_db::repositories::plans;
use oewang_domain::{AppError, Feature, Result};
use sqlx::PgExecutor;

/// `FEATURE_NOT_IN_PLAN` when the workspace's plan leaves `feature` out.
///
/// An unknown or deleted workspace passes: the caller's own checks answer
/// for it (`NOT_A_MEMBER`, `NOT_FOUND`), as they did before plans existed.
pub async fn require(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    feature: Feature,
) -> Result<()> {
    match plans::workspace_plan(executor, workspace_id)
        .await
        .map_err(|error| AppError::Internal(error.into()))?
    {
        Some(plan) if !plan.features.contains(&feature) => Err(AppError::FeatureNotInPlan(feature)),
        _ => Ok(()),
    }
}
