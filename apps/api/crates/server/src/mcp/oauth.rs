//! OAuth 2.1 for MCP connector apps (D106, MCP-9).
//!
//! Public clients only: an app registers itself, a person approves it on
//! the consent page, and the app trades a single-use code for tokens with
//! PKCE (S256, required). What the old app's server got wrong is what this
//! one refuses: every code and token is stored as SHA-256; a redirect URI
//! must match one the client registered, exactly; a code is claimed in one
//! statement; a refresh token rotates, and presenting a spent one revokes
//! the whole grant. The tokens are ordinary MCP tokens, so membership is
//! re-read on every call exactly as for a personal one.

use chrono::{Duration, Utc};
use oewang_db::repositories::mcp::{self, NewCode, NewToken};
use oewang_domain::{AppError, Result};
use serde::Serialize;
use serde_json::json;
use sqlx::PgPool;

use crate::{
    audit::{log, Actor},
    auth::token,
    mcp::tokens::{self, TOKEN_PREFIX},
};

pub const ACCESS_TTL_SECS: i64 = 60 * 60;
const REFRESH_TTL_DAYS: i64 = 30;
const CODE_TTL_MINUTES: i64 = 10;
const REFRESH_PREFIX: &str = "owr_";
const MAX_REDIRECT_URIS: usize = 10;
pub const SCOPE: &str = "mcp";

/// An error in RFC 6749's shape, which is what a client reads.
#[derive(Debug)]
pub struct OAuthError {
    pub error: &'static str,
    pub description: &'static str,
}

impl OAuthError {
    fn new(error: &'static str, description: &'static str) -> Self {
        Self { error, description }
    }
}

pub enum Failure {
    OAuth(OAuthError),
    App(AppError),
}

impl From<AppError> for Failure {
    fn from(error: AppError) -> Self {
        Failure::App(error)
    }
}

impl From<sqlx::Error> for Failure {
    fn from(error: sqlx::Error) -> Self {
        Failure::App(AppError::Internal(anyhow::anyhow!(error)))
    }
}

fn oauth(error: &'static str, description: &'static str) -> Failure {
    Failure::OAuth(OAuthError::new(error, description))
}

// ------------------------------------------------------------ registration

#[derive(Debug, Serialize)]
pub struct Registered {
    pub client_id: String,
    pub client_name: String,
    pub redirect_uris: Vec<String>,
    pub client_id_issued_at: i64,
    pub token_endpoint_auth_method: &'static str,
    pub grant_types: [&'static str; 2],
    pub response_types: [&'static str; 1],
}

/// Dynamic client registration (RFC 7591), public clients only. Anyone may
/// register any name; the consent page says the name is not verified.
pub async fn register(
    pool: &PgPool,
    name: Option<&str>,
    redirect_uris: &[String],
) -> std::result::Result<Registered, Failure> {
    let name = name
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("MCP client");
    if name.chars().count() > 100 {
        return Err(oauth(
            "invalid_client_metadata",
            "client_name is at most 100 characters.",
        ));
    }
    if redirect_uris.is_empty() || redirect_uris.len() > MAX_REDIRECT_URIS {
        return Err(oauth(
            "invalid_redirect_uri",
            "Send between 1 and 10 redirect_uris.",
        ));
    }
    if !redirect_uris.iter().all(|uri| valid_redirect(uri)) {
        return Err(oauth(
            "invalid_redirect_uri",
            "A redirect URI must be https, http on localhost, or an app's own scheme.",
        ));
    }

    let row = mcp::insert_client(
        pool,
        &format!("owc_{}", cuid2::create_id()),
        name,
        redirect_uris,
    )
    .await?;
    Ok(Registered {
        client_id: row.id,
        client_name: row.name,
        redirect_uris: row.redirect_uris,
        client_id_issued_at: row.created_at.timestamp(),
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
    })
}

/// https anywhere; http only to this machine (a CLI's loopback listener);
/// or an app's own scheme (`cursor://…`). Never a scheme a browser runs.
pub fn valid_redirect(uri: &str) -> bool {
    if uri.len() > 2000 || uri.chars().any(char::is_whitespace) || uri.contains('#') {
        return false;
    }
    let Some((scheme, rest)) = uri.split_once("://") else {
        return false;
    };
    let scheme = scheme.to_ascii_lowercase();
    if scheme.is_empty()
        || !scheme
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "+.-".contains(c))
    {
        return false;
    }
    let host = rest.split(['/', '?']).next().unwrap_or_default();
    let host_only = host.rsplit_once('@').map_or(host, |(_, h)| h);
    let host_name = if host_only.starts_with('[') {
        host_only
            .split(']')
            .next()
            .map(|h| format!("{h}]"))
            .unwrap_or_default()
    } else {
        host_only.split(':').next().unwrap_or_default().to_string()
    };
    match scheme.as_str() {
        "https" => !host_name.is_empty(),
        "http" => matches!(host_name.as_str(), "localhost" | "127.0.0.1" | "[::1]"),
        "javascript" | "data" | "file" | "vbscript" | "about" | "blob" | "ftp" | "ws" | "wss" => {
            false
        }
        _ => true,
    }
}

// ------------------------------------------------------------------ consent

#[derive(Debug, Serialize)]
pub struct ClientView {
    pub client_id: String,
    pub client_name: String,
    pub redirect_uris: Vec<String>,
}

pub async fn client(pool: &PgPool, client_id: &str) -> Result<ClientView> {
    let row = mcp::find_client(pool, client_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    Ok(ClientView {
        client_id: row.id,
        client_name: row.name,
        redirect_uris: row.redirect_uris,
    })
}

pub struct Consent<'a> {
    pub client_id: &'a str,
    pub redirect_uri: &'a str,
    pub code_challenge: &'a str,
    pub code_challenge_method: &'a str,
    /// None is every workspace.
    pub workspace_ids: Option<Vec<String>>,
}

/// The person said yes: issue a single-use code bound to this client, this
/// redirect URI and this PKCE challenge.
pub async fn authorize(pool: &PgPool, actor: Actor<'_>, consent: Consent<'_>) -> Result<String> {
    let client = mcp::find_client(pool, consent.client_id)
        .await
        .map_err(internal)?
        .ok_or_else(|| AppError::validation([("client_id", "Unknown app.")]))?;
    if !client
        .redirect_uris
        .iter()
        .any(|uri| uri == consent.redirect_uri)
    {
        return Err(AppError::validation([(
            "redirect_uri",
            "Not one the app registered.",
        )]));
    }
    if consent.code_challenge_method != "S256" || !valid_challenge(consent.code_challenge) {
        return Err(AppError::validation([(
            "code_challenge",
            "PKCE S256 is required.",
        )]));
    }
    let workspace_ids = tokens::grant(pool, actor.user_id, consent.workspace_ids).await?;

    let code = token::issue_refresh_token();
    let mut tx = pool.begin().await.map_err(internal)?;
    mcp::insert_code(
        &mut *tx,
        NewCode {
            code_hash: &code.hash,
            client_id: &client.id,
            user_id: actor.user_id,
            workspace_ids: workspace_ids.as_deref(),
            redirect_uri: consent.redirect_uri,
            code_challenge: consent.code_challenge,
            expires_at: Utc::now() + Duration::minutes(CODE_TTL_MINUTES),
        },
    )
    .await
    .map_err(internal)?;
    log(
        &mut tx,
        actor,
        "mcp.connection_authorized",
        "oauth_client",
        &client.id,
        None,
        Some(json!({ "client_name": client.name, "workspace_ids": workspace_ids })),
    )
    .await?;
    tx.commit().await.map_err(internal)?;
    Ok(code.raw)
}

/// 43 to 128 characters of base64url, as RFC 7636 allows.
fn valid_challenge(challenge: &str) -> bool {
    (43..=128).contains(&challenge.len())
        && challenge
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

// -------------------------------------------------------------------- token

#[derive(Debug, Serialize)]
pub struct Tokens {
    pub access_token: String,
    pub token_type: &'static str,
    pub expires_in: i64,
    pub refresh_token: String,
    pub scope: &'static str,
}

pub struct CodeExchange<'a> {
    pub code: &'a str,
    pub client_id: &'a str,
    pub redirect_uri: &'a str,
    pub code_verifier: &'a str,
}

pub async fn exchange_code(
    pool: &PgPool,
    exchange: CodeExchange<'_>,
) -> std::result::Result<Tokens, Failure> {
    let mut tx = pool.begin().await?;
    // Claimed before anything is compared: a code that fails a check is
    // spent all the same, so it cannot be tried again with other values.
    let code = mcp::claim_code(&mut *tx, &token::hash_token(exchange.code))
        .await?
        .ok_or_else(|| oauth("invalid_grant", "The code is unknown, used or expired."))?;
    tx.commit().await?;

    if code.client_id != exchange.client_id || code.redirect_uri != exchange.redirect_uri {
        return Err(oauth(
            "invalid_grant",
            "The code was issued to another client or redirect URI.",
        ));
    }
    if token::hash_token(exchange.code_verifier) != code.code_challenge {
        return Err(oauth(
            "invalid_grant",
            "The code_verifier does not match the challenge.",
        ));
    }

    let client = mcp::find_client(pool, &code.client_id)
        .await?
        .ok_or_else(|| oauth("invalid_client", "The app is no longer registered."))?;
    let mut tx = pool.begin().await?;
    let issued = issue(
        &mut tx,
        &code.user_id,
        &client.name,
        &client.id,
        &token::new_family_id(),
        code.workspace_ids.as_deref(),
    )
    .await?;
    tx.commit().await?;
    Ok(issued)
}

pub async fn refresh(
    pool: &PgPool,
    refresh_token: &str,
    client_id: &str,
) -> std::result::Result<Tokens, Failure> {
    let mut tx = pool.begin().await?;
    let row = mcp::lock_by_refresh(&mut *tx, &token::hash_token(refresh_token))
        .await?
        .ok_or_else(|| oauth("invalid_grant", "The refresh token is unknown."))?;

    if row.revoked_at.is_some() {
        // A spent refresh token came back: someone holds a copy. End the
        // whole grant, as a refresh-token replay does for sessions (D38).
        if let Some(family) = &row.family_id {
            mcp::revoke_family(&mut *tx, family).await?;
        }
        tx.commit().await?;
        return Err(oauth(
            "invalid_grant",
            "The refresh token was already used; the connection is revoked.",
        ));
    }
    if row.client_id.as_deref() != Some(client_id) {
        return Err(oauth(
            "invalid_grant",
            "The refresh token belongs to another client.",
        ));
    }
    if row.refresh_expires_at.is_some_and(|at| at <= Utc::now()) {
        return Err(oauth("invalid_grant", "The refresh token has expired."));
    }

    mcp::revoke_id(&mut *tx, &row.id).await?;
    let family = row.family_id.clone().unwrap_or_else(token::new_family_id);
    let issued = issue(
        &mut tx,
        &row.user_id,
        &row.name,
        client_id,
        &family,
        row.workspace_ids.as_deref(),
    )
    .await?;
    tx.commit().await?;
    Ok(issued)
}

async fn issue(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: &str,
    name: &str,
    client_id: &str,
    family_id: &str,
    workspace_ids: Option<&[String]>,
) -> std::result::Result<Tokens, Failure> {
    let access = format!("{TOKEN_PREFIX}{}", token::issue_refresh_token().raw);
    let refresh = format!("{REFRESH_PREFIX}{}", token::issue_refresh_token().raw);
    let now = Utc::now();
    mcp::insert_token(
        &mut **tx,
        NewToken {
            id: &cuid2::create_id(),
            user_id,
            kind: "oauth",
            name,
            client_id: Some(client_id),
            token_hash: &token::hash_token(&access),
            token_prefix: &access[..12],
            refresh_hash: Some(&token::hash_token(&refresh)),
            family_id: Some(family_id),
            workspace_ids,
            expires_at: Some(now + Duration::seconds(ACCESS_TTL_SECS)),
            refresh_expires_at: Some(now + Duration::days(REFRESH_TTL_DAYS)),
        },
    )
    .await?;
    Ok(Tokens {
        access_token: access,
        token_type: "Bearer",
        expires_in: ACCESS_TTL_SECS,
        refresh_token: refresh,
        scope: SCOPE,
    })
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}
