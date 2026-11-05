//! What each workspace spends: model tokens and stored bytes (D92).
//!
//! Recorded, summed and shown, never limited. Billing and quotas remain a
//! non-goal; this is the record a limit would one day be built on.
//!
//! See docs/features/usage.md.

pub mod handler;

use oewang_db::{repositories::usage, PgPool};
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

fn clamp(tokens: i64) -> i32 {
    tokens.clamp(0, i64::from(i32::MAX)) as i32
}

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
