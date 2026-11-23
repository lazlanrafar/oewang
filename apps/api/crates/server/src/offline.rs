//! Writes a client may have queued while offline (MOB-6, MOB-7).
//!
//! Two rules shared by transactions, wallets and categories, kept here so
//! the three cannot drift apart: a create may carry a client-made id and is
//! then safe to repeat (D114), and an edit may carry `If-Match` and is then
//! refused when the row moved on since the client read it (D115).

use std::future::Future;

use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts},
};
use chrono::{DateTime, Utc};
use oewang_db::repositories::ids;
use oewang_domain::{AppError, Result};
use serde::Serialize;
use sqlx::PgExecutor;

use crate::response::{ApiError, RequestId};

pub const TRANSACTION: &str = "transaction";
pub const WALLET: &str = "wallet";
pub const CATEGORY: &str = "category";

// ------------------------------------------------------------- client ids

/// A client id is a CUID2 the length the API makes its own, 24, up to the
/// crate's 32. Shorter ones are valid CUID2s but collide across devices.
pub fn validate_id(id: &str) -> Result<()> {
    if (24..=32).contains(&id.len()) && cuid2::is_cuid2(id) {
        Ok(())
    } else {
        Err(AppError::validation([(
            "id",
            "Use a CUID2: 24 to 32 lowercase letters and digits, starting with a letter.",
        )]))
    }
}

/// Whether `id` already names a `kind` row of this workspace, live or
/// deleted, which makes this create a repeat. Anything else holding the id
/// is `ID_TAKEN`, and the row it names is never read (D114).
pub async fn is_repeat(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    kind: &str,
    id: &str,
) -> Result<bool> {
    match ids::holder(executor, id).await.map_err(internal)? {
        None => Ok(false),
        Some(holder) if holder.kind == kind && holder.workspace_id == workspace_id => Ok(true),
        Some(_) => Err(AppError::IdTaken),
    }
}

// --------------------------------------------------------------- If-Match

/// `If-Match: <updated_at>`, the RFC 3339 `updated_at` the client last read.
///
/// Compared as an instant, so `Z` and `+00:00` agree. The API emits every
/// digit Postgres stores (microseconds), so a value echoed verbatim matches
/// exactly; one re-serialized through a millisecond clock does not, and is
/// refused as stale, never accepted by rounding.
#[derive(Debug, Clone, Copy, Default)]
pub struct IfMatch(pub Option<DateTime<Utc>>);

impl<S: Send + Sync> FromRequestParts<S> for IfMatch {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &S,
    ) -> std::result::Result<Self, ApiError> {
        let Some(value) = parts.headers.get(header::IF_MATCH) else {
            return Ok(Self(None));
        };

        match value.to_str().ok().and_then(parse_if_match) {
            Some(seen) => Ok(Self(Some(seen))),
            None => {
                let RequestId(request_id) = match RequestId::from_request_parts(parts, state).await
                {
                    Ok(id) => id,
                    Err(never) => match never {},
                };
                Err(ApiError::new(
                    AppError::validation([(
                        "If-Match",
                        "Send the updated_at you last read, exactly as the API gave it.",
                    )]),
                    request_id,
                ))
            }
        }
    }
}

/// A quoted value, the shape an ETag would have, is read the same.
fn parse_if_match(raw: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(raw.trim().trim_matches('"'))
        .ok()
        .map(|seen| seen.with_timezone(&Utc))
}

/// Refuse the edit when the client saw another version. Call it on a row
/// read under its lock, or back it with the update's own `updated_at` guard.
pub fn check(if_match: Option<DateTime<Utc>>, updated_at: DateTime<Utc>) -> Result<()> {
    match if_match {
        Some(seen) if seen != updated_at => Err(AppError::Stale(None)),
        _ => Ok(()),
    }
}

/// What an edit answers when the live row is not there: `STALE` when the
/// client sent `If-Match` and the row is this workspace's but deleted, the
/// usual not-found otherwise. Another workspace's row stays a 404.
pub async fn missing(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    kind: &str,
    id: &str,
    if_match: Option<DateTime<Utc>>,
    not_found: AppError,
) -> AppError {
    if if_match.is_none() {
        return not_found;
    }
    match is_repeat(executor, workspace_id, kind, id).await {
        Ok(true) => AppError::Stale(None),
        Ok(false) | Err(AppError::IdTaken) => not_found,
        Err(other) => other,
    }
}

/// Fill a `STALE` with the row as it reads now, null when it is deleted.
/// Any other result passes through and `current` is never run.
pub async fn with_current<T, V: Serialize>(
    result: Result<T>,
    current: impl Future<Output = Result<V>>,
) -> Result<T> {
    match result {
        Err(AppError::Stale(_)) => Err(AppError::Stale(
            current
                .await
                .ok()
                .and_then(|row| serde_json::to_value(row).ok()),
        )),
        other => other,
    }
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    /// MOB-6
    #[test]
    fn should_accept_only_a_full_length_cuid2_as_a_client_id() {
        assert!(validate_id(&cuid2::create_id()).is_ok());
        assert!(validate_id("tz4a98xxat96iws9zmbrgj3a").is_ok());
        for bad in [
            "ab",
            "Tz4a98xxat96iws9zmbrgj3a",
            "1z4a98xxat96iws9zmbrgj3a",
            "tz4a98xx-t96iws9zmbrgj3a",
            "",
        ] {
            assert!(validate_id(bad).is_err(), "{bad}");
        }
    }

    /// MOB-7: the format is the one `updated_at` is emitted in, compared as an
    /// instant at full microsecond precision.
    #[test]
    fn should_read_if_match_as_the_emitted_updated_at() {
        let stored = Utc.timestamp_opt(1_795_000_000, 123_456_000).unwrap();
        let emitted = stored.to_rfc3339();

        assert_eq!(parse_if_match(&emitted), Some(stored));
        assert_eq!(parse_if_match(&format!("\"{emitted}\"")), Some(stored));
        assert_eq!(
            parse_if_match(&stored.to_rfc3339_opts(chrono::SecondsFormat::Micros, true)),
            Some(stored)
        );
        assert!(check(parse_if_match(&emitted), stored).is_ok());

        // A millisecond copy of the same instant is another version.
        let millis = stored.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        assert!(matches!(
            check(parse_if_match(&millis), stored),
            Err(AppError::Stale(None))
        ));

        assert_eq!(parse_if_match("yesterday"), None);
        assert_eq!(parse_if_match("*"), None);
        assert!(check(None, stored).is_ok());
    }
}
