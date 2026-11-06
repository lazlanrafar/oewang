//! The MCP token on a request (D106).
//!
//! The bearer is an opaque token, looked up by its SHA-256 (AUTH-8). It
//! names a person and a set of workspaces, not a role: the role is read
//! from the membership row on every call, in `service::call`, so a demoted
//! or removed member loses access at once.

use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts},
};
use oewang_db::repositories::mcp;
use oewang_domain::AppError;

use crate::{auth::token::hash_token, response::ApiError, state::AppState};

#[derive(Debug, Clone)]
pub struct McpCaller {
    pub token_id: String,
    pub user_id: String,
    /// None reaches every workspace the person belongs to.
    pub workspace_ids: Option<Vec<String>>,
}

impl FromRequestParts<AppState> for McpCaller {
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
        let refuse = || ApiError::new(AppError::McpTokenInvalid, request_id.clone());

        let raw = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(refuse)?;

        let row = mcp::find_live(&state.db, &hash_token(raw))
            .await
            .map_err(|error| {
                ApiError::new(
                    AppError::Internal(anyhow::anyhow!(error)),
                    request_id.clone(),
                )
            })?
            .ok_or_else(refuse)?;

        if let Err(error) = mcp::touch(&state.db, &row.id).await {
            tracing::warn!(%error, "mcp token last use not recorded");
        }

        Ok(McpCaller {
            token_id: row.id,
            user_id: row.user_id,
            workspace_ids: row.workspace_ids,
        })
    }
}
