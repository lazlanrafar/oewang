//! Personal access tokens for MCP (D106, MCP-2).
//!
//! A person makes one in the account area, sees it once, and pastes it into
//! a client's config. Only its SHA-256 is kept (AUTH-8). Its reach is every
//! workspace the person belongs to, or the ones they picked; either way the
//! membership is read again on every call.

use chrono::{Duration, Utc};
use oewang_db::repositories::{
    accounts,
    mcp::{self, McpTokenRow, NewToken},
};
use oewang_domain::{AppError, Result};
use serde_json::json;
use sqlx::PgPool;

use crate::{
    audit::{log, Actor},
    auth::token,
};

/// What a raw token starts with, so a leaked one is recognisable in a log
/// or a scanner.
pub const TOKEN_PREFIX: &str = "owm_";
const MAX_NAME_CHARS: usize = 100;
/// Expiry choices, in days. None never expires; revoking still ends it.
pub const EXPIRY_DAYS: [i64; 3] = [30, 90, 365];

pub struct Created {
    pub row: McpTokenRow,
    /// Shown once.
    pub raw: String,
}

pub async fn create(
    pool: &PgPool,
    actor: Actor<'_>,
    name: &str,
    workspace_ids: Option<Vec<String>>,
    expires_in_days: Option<i64>,
) -> Result<Created> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::validation([(
            "name",
            "Give it a name of up to 100 characters.",
        )]));
    }
    if let Some(days) = expires_in_days {
        if !EXPIRY_DAYS.contains(&days) {
            return Err(AppError::validation([(
                "expires_in_days",
                "Use 30, 90 or 365 days, or no expiry.",
            )]));
        }
    }
    let workspace_ids = grant(pool, actor.user_id, workspace_ids).await?;

    let secret = token::issue_refresh_token();
    let raw = format!("{TOKEN_PREFIX}{}", secret.raw);
    let id = cuid2::create_id();

    let mut tx = pool.begin().await.map_err(internal)?;
    let row = mcp::insert_token(
        &mut *tx,
        NewToken {
            id: &id,
            user_id: actor.user_id,
            kind: "pat",
            name,
            client_id: None,
            token_hash: &token::hash_token(&raw),
            token_prefix: &raw[..12],
            refresh_hash: None,
            family_id: None,
            workspace_ids: workspace_ids.as_deref(),
            expires_at: expires_in_days.map(|days| Utc::now() + Duration::days(days)),
            refresh_expires_at: None,
        },
    )
    .await
    .map_err(internal)?;
    log(
        &mut tx,
        actor,
        "mcp.token_created",
        "mcp_token",
        &id,
        None,
        Some(json!({ "name": name, "workspace_ids": workspace_ids, "expires_in_days": expires_in_days })),
    )
    .await?;
    tx.commit().await.map_err(internal)?;

    Ok(Created { row, raw })
}

/// Revoke a token or a connected app. Only the person's own.
pub async fn revoke(pool: &PgPool, actor: Actor<'_>, id: &str) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;
    let ended = mcp::revoke(&mut *tx, actor.user_id, id)
        .await
        .map_err(internal)?;
    if ended == 0 {
        return Err(AppError::NotFound);
    }
    log(
        &mut tx,
        actor,
        "mcp.token_revoked",
        "mcp_token",
        id,
        None,
        None,
    )
    .await?;
    tx.commit().await.map_err(internal)
}

pub async fn list(pool: &PgPool, user_id: &str, kind: &str) -> Result<Vec<McpTokenRow>> {
    mcp::list_for_user(pool, user_id, kind)
        .await
        .map_err(internal)
}

/// None is every workspace. A list must be non-empty and every id one the
/// person is a member of now; it is stored sorted and without repeats.
pub async fn grant(
    pool: &PgPool,
    user_id: &str,
    workspace_ids: Option<Vec<String>>,
) -> Result<Option<Vec<String>>> {
    let Some(mut ids) = workspace_ids else {
        return Ok(None);
    };
    ids.sort();
    ids.dedup();
    if ids.is_empty() {
        return Err(AppError::validation([(
            "workspace_ids",
            "Pick at least one workspace, or all of them.",
        )]));
    }
    let mine = accounts::list_workspaces_for_user(pool, user_id)
        .await
        .map_err(internal)?;
    if ids.iter().any(|id| !mine.iter().any(|row| &row.id == id)) {
        return Err(AppError::validation([(
            "workspace_ids",
            "Pick workspaces you belong to.",
        )]));
    }
    Ok(Some(ids))
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}
