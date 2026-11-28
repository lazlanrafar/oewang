//! What each workspace spends: model tokens and stored bytes (D92).
//!
//! Recorded, summed and shown, and limited by the workspace's plan (D128):
//! the checks here run before a model call or an upload starts.
//!
//! See docs/features/usage.md and docs/features/plans.md.

pub mod handler;

use oewang_db::{
    repositories::{plans, usage, vault},
    PgPool,
};
use oewang_domain::{AppError, Result};
use serde::Deserialize;

/// Which part of the product spent the tokens (USG-2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Feature {
    Chat,
    Telegram,
    Receipt,
    Categorize,
    Import,
    Columns,
}

impl Feature {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Chat => "chat",
            Self::Telegram => "telegram",
            Self::Receipt => "receipt",
            Self::Categorize => "categorize",
            Self::Import => "import",
            Self::Columns => "columns",
        }
    }
}

/// What the AI service reports for one call: the summed tokens of every
/// model request it made, and the model it ended on.
#[derive(Debug, Default, Clone, Deserialize, PartialEq, Eq)]
pub struct Usage {
    #[serde(default)]
    pub input: i64,
    #[serde(default)]
    pub output: i64,
    #[serde(default)]
    pub model: Option<String>,
}

/// Who a model call was made for, carried to the one place that talks to
/// the AI service so the record is written there and nowhere else.
#[derive(Debug, Clone, Copy)]
pub struct Meter<'a> {
    pub pool: &'a PgPool,
    pub workspace_id: &'a str,
    pub user_id: Option<&'a str>,
}

impl<'a> Meter<'a> {
    pub fn new(pool: &'a PgPool, workspace_id: &'a str, user_id: Option<&'a str>) -> Self {
        Self {
            pool,
            workspace_id,
            user_id,
        }
    }

    /// Refuse the call before it is made when the plan's tokens are used up.
    pub async fn check(&self) -> Result<()> {
        ensure_tokens_left(self.pool, self.workspace_id).await
    }

    /// Write one ledger row. Never fails the call it describes: a reply the
    /// user already has must not turn into an error because its receipt
    /// could not be filed, so a failure is logged and dropped.
    pub async fn record(&self, feature: Feature, usage: Option<&Usage>) {
        let Some(usage) = usage else { return };
        if usage.input <= 0 && usage.output <= 0 {
            return;
        }

        let id = cuid2::create_id();
        let row = usage::NewUsage {
            id: &id,
            workspace_id: self.workspace_id,
            user_id: self.user_id,
            feature: feature.as_str(),
            model: usage.model.as_deref(),
            input_tokens: clamp(usage.input),
            output_tokens: clamp(usage.output),
        };

        if let Err(error) = usage::insert(self.pool, row).await {
            tracing::warn!(feature = feature.as_str(), %error, "AI usage was not recorded");
        }
    }
}

/// The owned form of a meter, for a chat turn whose stream outlives the
/// request that started it.
#[derive(Debug, Clone)]
pub struct TurnMeter {
    pub user_id: Option<String>,
    pub feature: Feature,
}

impl TurnMeter {
    /// A turn from the given channel: Telegram is counted apart from the
    /// web chat, because it is a different way of spending.
    pub fn for_channel(user_id: &str, channel: &str) -> Self {
        Self {
            user_id: Some(user_id.to_string()),
            feature: if channel == crate::ai::service::CHANNEL_TELEGRAM {
                Feature::Telegram
            } else {
                Feature::Chat
            },
        }
    }

    pub async fn record(
        &self,
        pool: &PgPool,
        workspace_id: &str,
        usage: Option<&serde_json::Value>,
    ) {
        let parsed = usage.and_then(|value| serde_json::from_value::<Usage>(value.clone()).ok());
        Meter::new(pool, workspace_id, self.user_id.as_deref())
            .record(self.feature, parsed.as_ref())
            .await;
    }
}

/// PLN-4: at or past the plan's monthly tokens, input plus output, no model
/// call starts. Checked before a call, never during one, so a chat turn that
/// crosses the limit finishes and the next one is refused.
pub async fn ensure_tokens_left(pool: &PgPool, workspace_id: &str) -> Result<()> {
    let Some(limit) = plan(pool, workspace_id).await?.max_tokens_month else {
        return Ok(());
    };
    let used = usage::month_tokens(pool, workspace_id)
        .await
        .map_err(internal)?;
    if used >= limit {
        return Err(AppError::QuotaTokensExceeded);
    }
    Ok(())
}

/// PLN-5: an upload whose declared size would take the stored bytes (ready,
/// live files, as the usage page sums them) past the plan's limit does not
/// start. Files already stored are never touched.
///
/// shortcut: not locked, so uploads begun at the same moment can each pass
/// and overshoot by one file each; lock the workspace row if that matters.
pub async fn ensure_storage_left(pool: &PgPool, workspace_id: &str, size_bytes: i64) -> Result<()> {
    let Some(limit) = plan(pool, workspace_id).await?.max_storage_bytes else {
        return Ok(());
    };
    let stored = vault::storage_usage(pool, workspace_id)
        .await
        .map_err(internal)?;
    if stored.bytes.saturating_add(size_bytes) > limit {
        return Err(AppError::QuotaStorageExceeded);
    }
    Ok(())
}

/// None is a workspace that is gone; the plan it held cannot be deleted
/// while held (`PLAN_IN_USE`).
async fn plan(pool: &PgPool, workspace_id: &str) -> Result<plans::WorkspacePlan> {
    plans::workspace_plan(pool, workspace_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

fn clamp(tokens: i64) -> i32 {
    tokens.clamp(0, i64::from(i32::MAX)) as i32
}

#[cfg(test)]
mod db_tests;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_read_usage_with_missing_fields_as_zero() {
        let usage: Usage = serde_json::from_value(serde_json::json!({ "input": 12 })).unwrap();
        assert_eq!(usage.input, 12);
        assert_eq!(usage.output, 0);
        assert_eq!(usage.model, None);
    }

    #[test]
    fn should_clamp_tokens_into_the_column() {
        assert_eq!(clamp(-3), 0);
        assert_eq!(clamp(i64::MAX), i32::MAX);
    }
}
