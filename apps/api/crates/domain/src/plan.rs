//! What a plan may include (PLN-1, D128).
//!
//! Features are this list, not rows, for the reason console permissions are
//! (D125): a feature means something only where an entry point checks it.
//! The `CHECK` on `plan_features.feature` in migration 0025 holds the same
//! keys.

use serde::{Serialize, Serializer};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Feature {
    Chat,
    Telegram,
    ReceiptScan,
    StatementImport,
    Mcp,
    Vault,
}

impl Feature {
    pub const ALL: [Self; 6] = [
        Self::Chat,
        Self::Telegram,
        Self::ReceiptScan,
        Self::StatementImport,
        Self::Mcp,
        Self::Vault,
    ];

    /// The stable key, stored in the database and sent to the app.
    pub fn key(self) -> &'static str {
        match self {
            Self::Chat => "chat",
            Self::Telegram => "telegram",
            Self::ReceiptScan => "receipt_scan",
            Self::StatementImport => "statement_import",
            Self::Mcp => "mcp",
            Self::Vault => "vault",
        }
    }

    pub fn parse(key: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|feature| feature.key() == key)
    }
}

impl Serialize for Feature {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.key())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_parse_every_key_back_to_its_feature() {
        for feature in Feature::ALL {
            assert_eq!(Feature::parse(feature.key()), Some(feature));
        }
        assert_eq!(Feature::parse("invoices"), None);
        assert_eq!(Feature::parse("Chat"), None);
    }

    #[test]
    fn should_serialize_as_the_key() {
        let json = serde_json::to_string(&Feature::ReceiptScan).unwrap();
        assert_eq!(json, r#""receipt_scan""#);
    }
}
