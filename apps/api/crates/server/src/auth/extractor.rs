//! The auth extractor and the role guard.
//!
//! One rule, and everything workspace-scoped depends on it:
//!
//! > `workspace_id` comes from the token's claims. A `workspace_id` in a
//! > body, a query or a path is never read.
//!
//! See docs/security/auth.md#workspace-scoping.

use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts},
};
use oewang_domain::{AppError, Role};

use crate::{
    audit::{Actor, SOURCE_WEB},
    auth::token,
    response::ApiError,
    state::AppState,
};

/// A verified caller.
///
/// A handler that takes this is authenticated; one that does not is public,
/// and that is visible at the signature rather than buried in a middleware
/// configuration.
#[derive(Debug, Clone)]
pub struct Auth {
    pub user_id: String,
    pub workspace_id: String,
    /// The role as it stood when the token was issued.
    ///
    /// A snapshot. Reads trust it; writes re-read the membership row, so a
    /// demotion takes effect on writes immediately rather than waiting out
    /// the token's 15 minutes.
    pub role: Role,
    /// The surface the request came through: `web` from a session, `mcp`
    /// when an MCP tool runs the same handler (D106). Audit rows carry it.
    pub source: &'static str,
}

impl Auth {
    /// Who a write is for, from where.
    pub fn actor(&self) -> Actor<'_> {
        Actor::web(&self.workspace_id, &self.user_id).with_source(self.source)
    }
}

impl FromRequestParts<AppState> for Auth {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let request_id = parts
            .headers
            .get("x-request-id")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("unknown")
            .to_string();

        let token = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
            .ok_or_else(|| ApiError::new(AppError::Unauthenticated, request_id.clone()))?;

        let claims = token::verify_access_token(&state.config.jwt_secret, token)
            .map_err(|error| ApiError::new(error, request_id))?;

        Ok(Auth {
            user_id: claims.sub,
            workspace_id: claims.wid,
            role: claims.role,
            source: SOURCE_WEB,
        })
    }
}

/// A caller whose live membership says they may write.
///
/// Re-reads the membership row rather than trusting the token's snapshot, so
/// a member who was demoted thirty seconds ago cannot still write for the
/// rest of the token's life. One database read per write, none per read:
/// that is the deliberate trade in docs/security/auth.md#the-token.
#[derive(Debug, Clone)]
pub struct AuthWrite {
    pub user_id: String,
    pub workspace_id: String,
    /// The role as the database has it right now.
    pub role: Role,
    /// See [`Auth::source`].
    pub source: &'static str,
}

impl AuthWrite {
    /// Who a write is for, from where.
    pub fn actor(&self) -> Actor<'_> {
        Actor::web(&self.workspace_id, &self.user_id).with_source(self.source)
    }
}

impl FromRequestParts<AppState> for AuthWrite {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth = Auth::from_request_parts(parts, state).await?;
        let request_id = parts
            .headers
            .get("x-request-id")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("unknown")
            .to_string();

        let role = crate::auth::service::current_role(&state.db, &auth.workspace_id, &auth.user_id)
            .await
            .map_err(|error| ApiError::new(error, request_id.clone()))?;

        if !role.can_write() {
            return Err(ApiError::new(AppError::InsufficientRole, request_id));
        }

        Ok(AuthWrite {
            user_id: auth.user_id,
            workspace_id: auth.workspace_id,
            role,
            source: auth.source,
        })
    }
}

/// A caller whose live membership says they own the workspace.
#[derive(Debug, Clone)]
pub struct AuthOwner {
    // Read by the audit row every mutation writes, from US-015 on.
    #[allow(dead_code)]
    pub user_id: String,
    pub workspace_id: String,
}

impl FromRequestParts<AppState> for AuthOwner {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let write = AuthWrite::from_request_parts(parts, state).await?;
        let request_id = parts
            .headers
            .get("x-request-id")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("unknown")
            .to_string();

        if !write.role.can_delete_workspace() {
            return Err(ApiError::new(AppError::InsufficientRole, request_id));
        }

        Ok(AuthOwner {
            user_id: write.user_id,
            workspace_id: write.workspace_id,
        })
    }
}

/// A caller holding the service key.
///
/// The internal routes are service to service: the AI service calls them,
/// and it carries no user token because it is never given one (D4). This
/// extractor says only that the call came from a process that holds the
/// key. Who the call is *for* arrives in the body and is re-checked against
/// the membership row before anything happens (SEC-23, CHAT-4).
#[derive(Debug, Clone, Copy)]
pub struct ServiceCaller;

impl FromRequestParts<AppState> for ServiceCaller {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let request_id = parts
            .headers
            .get("x-request-id")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("unknown")
            .to_string();

        let presented = parts
            .headers
            .get("x-api-key")
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();

        if constant_time_eq(
            presented.as_bytes(),
            state.config.ai_service_api_key.expose().as_bytes(),
        ) {
            Ok(ServiceCaller)
        } else {
            Err(ApiError::new(AppError::Unauthenticated, request_id))
        }
    }
}

/// Compare without leaking where two keys first differ.
///
/// The length is not secret and is compared first; the bytes are folded so
/// the loop runs the same way whatever they hold.
fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() || left.is_empty() {
        return false;
    }

    left.iter()
        .zip(right)
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

#[cfg(test)]
mod service_key_tests {
    use super::constant_time_eq;

    #[test]
    fn should_match_only_an_identical_key() {
        assert!(constant_time_eq(b"a-service-key", b"a-service-key"));
        assert!(!constant_time_eq(b"a-service-key", b"a-service-kez"));
        assert!(!constant_time_eq(b"a-service-key", b"a-service-ke"));
    }

    #[test]
    fn should_never_match_an_absent_key() {
        assert!(!constant_time_eq(b"", b""));
        assert!(!constant_time_eq(b"", b"a-service-key"));
    }
}
