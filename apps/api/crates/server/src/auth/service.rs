//! Auth business rules.
//!
//! Services own the rules and are the only layer that opens a database
//! transaction. Handlers parse and map to HTTP; repositories run SQL.

use std::time::Duration;

use chrono::{Duration as ChronoDuration, Utc};
use oewang_db::{
    repositories::{accounts, tokens},
    PgPool,
};
use oewang_domain::{
    auth::{normalize_email, validate_email, validate_password},
    AppError, Result, Role, Secret,
};

use crate::auth::{password, token};

pub struct IssuedSession {
    pub access_token: String,
    pub access_expires_at: i64,
    pub refresh_token: String,
    pub refresh_expires_at: i64,
    pub user_id: String,
    /// `None` while the user has no workspace (D109).
    pub workspace_id: Option<String>,
    pub role: Option<Role>,
}

pub struct SessionContext<'a> {
    pub jwt_secret: &'a Secret,
    pub access_ttl: Duration,
    pub refresh_ttl: Duration,
    pub user_agent: Option<&'a str>,
    pub ip: Option<&'a str>,
}

/// Read the caller's role from the database.
///
/// `NotAMember` rather than `NotFound`: the caller holds a valid token for a
/// workspace they are no longer in, and that is a different situation from a
/// missing row.
pub async fn current_role(pool: &PgPool, workspace_id: &str, user_id: &str) -> Result<Role> {
    let membership = accounts::find_membership(pool, workspace_id, user_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotAMember)?;

    membership
        .role
        .parse::<Role>()
        .map_err(|error| AppError::Internal(anyhow::anyhow!("unknown role in database: {error}")))
}

/// Create a user and open a session with no workspace (WS-5, D109).
///
/// The workspace comes after, on its own page: the user creates one, or
/// accepts the invitation that brought them here. Asking for a workspace
/// name on the sign-up form made an invited person create a workspace they
/// never wanted before they could join the one they were invited to.
pub async fn register(
    pool: &PgPool,
    email: &str,
    password_plain: &str,
    name: Option<&str>,
    session: SessionContext<'_>,
) -> Result<IssuedSession> {
    validate_email(email)?;
    validate_password(password_plain)?;

    let email = normalize_email(email);

    // Hash before opening the transaction: Argon2id is deliberately slow, and
    // holding a pool connection for the duration would be wasteful.
    let password_hash = password::hash(password_plain.to_string()).await?;

    let mut tx = pool.begin().await.map_err(internal)?;

    if accounts::email_exists(&mut *tx, &email)
        .await
        .map_err(internal)?
    {
        return Err(AppError::EmailTaken);
    }

    let user_id = cuid2::create_id();

    accounts::insert_user(&mut *tx, &user_id, &email, name, &password_hash)
        .await
        .map_err(internal)?;

    let issued = issue_session(&mut tx, &user_id, None, token::new_family_id(), &session).await?;

    tx.commit().await.map_err(internal)?;
    Ok(issued)
}

/// Verify credentials and open a session.
///
/// An unknown email and a wrong password answer the same way and spend the
/// same work, so the endpoint cannot be used to discover who has an account
/// (AUTH-5).
pub async fn login(
    pool: &PgPool,
    email: &str,
    password_plain: &str,
    session: SessionContext<'_>,
) -> Result<IssuedSession> {
    let email = normalize_email(email);

    let credentials = accounts::find_credentials_by_email(pool, &email)
        .await
        .map_err(internal)?;

    let Some(credentials) = credentials else {
        password::verify_dummy(password_plain.to_string()).await;
        return Err(AppError::InvalidCredentials);
    };

    if !password::verify(password_plain.to_string(), credentials.password_hash).await {
        return Err(AppError::InvalidCredentials);
    }

    sign_in(pool, &credentials.id, session).await
}

/// Open a session for someone who has just proved who they are, by
/// password or by passkey.
///
/// Scoped to the first workspace they joined; switching is a separate
/// call. With no workspace at all, as after signing up or after leaving
/// the last one, the session has none either, and the app takes them to
/// create one (D109).
pub(crate) async fn sign_in(
    pool: &PgPool,
    user_id: &str,
    session: SessionContext<'_>,
) -> Result<IssuedSession> {
    let workspaces = accounts::list_workspaces_for_user(pool, user_id)
        .await
        .map_err(internal)?;
    let scope = match workspaces.first() {
        Some(first) => Some((
            first.id.as_str(),
            first
                .role
                .parse::<Role>()
                .map_err(|_| AppError::NotAMember)?,
        )),
        None => None,
    };

    let mut tx = pool.begin().await.map_err(internal)?;
    let issued = issue_session(&mut tx, user_id, scope, token::new_family_id(), &session).await?;
    tx.commit().await.map_err(internal)?;

    Ok(issued)
}

/// Rotate a refresh token.
///
/// The reuse branch is the important one: a token used twice means either a
/// stolen copy or a race, and both are handled identically because they are
/// indistinguishable. The whole family is revoked and the user signs in
/// again. A false positive costs one re-login; ignoring it would let an
/// attacker keep a parallel session alive indefinitely (AUTH-9).
pub async fn refresh(
    pool: &PgPool,
    raw_token: &str,
    session: SessionContext<'_>,
) -> Result<IssuedSession> {
    let hash = token::hash_token(raw_token);

    let mut tx = pool.begin().await.map_err(internal)?;

    let row = tokens::lock_refresh_token(&mut *tx, &hash)
        .await
        .map_err(internal)?
        .ok_or(AppError::Unauthenticated)?;

    if row.revoked_at.is_some() {
        return Err(AppError::Unauthenticated);
    }

    if row.used_at.is_some() {
        let revoked = tokens::revoke_family(&mut *tx, &row.family_id)
            .await
            .map_err(internal)?;
        tx.commit().await.map_err(internal)?;

        tracing::warn!(
            family_id = %row.family_id,
            user_id = %row.user_id,
            revoked,
            "refresh token reuse detected, family revoked"
        );
        return Err(AppError::Unauthenticated);
    }

    if row.expires_at <= Utc::now() {
        return Err(AppError::Unauthenticated);
    }

    // The role may have changed since the token was issued, so read it now
    // rather than carrying the old one forward. A session with no workspace
    // stays without one: joining one is a switch, not a refresh (D109).
    let role = match &row.workspace_id {
        Some(workspace_id) => Some(
            accounts::find_membership(&mut *tx, workspace_id, &row.user_id)
                .await
                .map_err(internal)?
                .ok_or(AppError::NotAMember)?
                .role
                .parse::<Role>()
                .map_err(|_| AppError::NotAMember)?,
        ),
        None => None,
    };

    tokens::mark_refresh_token_used(&mut *tx, &row.id)
        .await
        .map_err(internal)?;

    let issued = issue_session(
        &mut tx,
        &row.user_id,
        row.workspace_id.as_deref().zip(role),
        // Same family: this token descends from the same login.
        row.family_id.clone(),
        &session,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(issued)
}

pub async fn logout(pool: &PgPool, raw_token: &str) -> Result<()> {
    tokens::revoke_by_hash(pool, &token::hash_token(raw_token))
        .await
        .map_err(internal)?;
    Ok(())
}

/// Sign out of every session, and unlink every Telegram chat: a chat is a
/// session that never expires on its own, so "everywhere" includes it (D85).
pub async fn logout_everywhere(pool: &PgPool, user_id: &str) -> Result<u64> {
    let mut tx = pool.begin().await.map_err(internal)?;
    let revoked = tokens::revoke_all_for_user(&mut *tx, user_id)
        .await
        .map_err(internal)?;
    crate::telegram::link::revoke_all_for_user(&mut *tx, user_id).await?;
    // MCP clients too: the same "every device" (D106).
    oewang_db::repositories::mcp::revoke_all_for_user(&mut *tx, user_id)
        .await
        .map_err(|error| oewang_domain::AppError::Internal(anyhow::anyhow!(error)))?;
    tx.commit().await.map_err(internal)?;
    Ok(revoked)
}

/// Re-scope a session to another workspace the user belongs to (WS-2).
pub async fn switch_workspace(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    session: SessionContext<'_>,
) -> Result<IssuedSession> {
    let membership = accounts::find_membership(pool, workspace_id, user_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotAMember)?;
    let role = membership
        .role
        .parse::<Role>()
        .map_err(|_| AppError::NotAMember)?;

    let mut tx = pool.begin().await.map_err(internal)?;
    let issued = issue_session(
        &mut tx,
        user_id,
        Some((workspace_id, role)),
        token::new_family_id(),
        &session,
    )
    .await?;
    tx.commit().await.map_err(internal)?;

    Ok(issued)
}

// ------------------------------------------------------- password reset

/// Begin a reset. Always succeeds from the caller's point of view, whether
/// or not the address exists, so the endpoint cannot enumerate users.
///
/// Returns the raw token when there is one to send. The caller decides what
/// to do with it; nothing is logged.
pub async fn begin_password_reset(pool: &PgPool, email: &str) -> Result<Option<(String, String)>> {
    let email = normalize_email(email);

    let Some(user_id) = accounts::find_user_id_by_email(pool, &email)
        .await
        .map_err(internal)?
    else {
        return Ok(None);
    };

    let reset = token::issue_refresh_token();
    let expires_at = Utc::now() + ChronoDuration::hours(1);

    tokens::insert_reset_token(pool, &cuid2::create_id(), &user_id, &reset.hash, expires_at)
        .await
        .map_err(internal)?;

    Ok(Some((email, reset.raw)))
}

/// Finish a reset: claim the token, set the hash, end every session.
///
/// Ending every session is the point. A password was reset because the old
/// one may be in someone else's hands, so any session opened with it has to
/// stop too.
pub async fn complete_password_reset(
    pool: &PgPool,
    raw_token: &str,
    new_password: &str,
) -> Result<()> {
    validate_password(new_password)?;
    let password_hash = password::hash(new_password.to_string()).await?;

    let mut tx = pool.begin().await.map_err(internal)?;

    let user_id = tokens::claim_reset_token(&mut *tx, &token::hash_token(raw_token))
        .await
        .map_err(internal)?
        .ok_or(AppError::ResetTokenInvalid)?;

    accounts::update_password(&mut *tx, &user_id, &password_hash)
        .await
        .map_err(internal)?;
    let revoked = tokens::revoke_all_for_user(&mut *tx, &user_id)
        .await
        .map_err(internal)?;
    crate::telegram::link::revoke_all_for_user(&mut *tx, &user_id).await?;
    // MCP clients too: the same "every device" (D106).
    oewang_db::repositories::mcp::revoke_all_for_user(&mut *tx, &user_id)
        .await
        .map_err(|error| oewang_domain::AppError::Internal(anyhow::anyhow!(error)))?;

    tx.commit().await.map_err(internal)?;

    tracing::info!(user_id = %user_id, revoked, "password reset completed");
    Ok(())
}

/// A new session inside a transaction the caller already holds, for a write
/// that must hand back fresh tokens in the same commit (D94).
pub(crate) async fn issue_in(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: &str,
    workspace_id: &str,
    role: Role,
    session: &SessionContext<'_>,
) -> Result<IssuedSession> {
    issue_session(
        tx,
        user_id,
        Some((workspace_id, role)),
        token::new_family_id(),
        session,
    )
    .await
}

// ------------------------------------------------------------- internals

async fn issue_session(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: &str,
    scope: Option<(&str, Role)>,
    family_id: String,
    session: &SessionContext<'_>,
) -> Result<IssuedSession> {
    let access = token::issue_access_token(session.jwt_secret, user_id, scope, session.access_ttl)?;
    let refresh = token::issue_refresh_token();
    let refresh_expires_at =
        Utc::now() + ChronoDuration::seconds(session.refresh_ttl.as_secs() as i64);

    tokens::insert_refresh_token(
        &mut **tx,
        &cuid2::create_id(),
        user_id,
        scope.map(|(workspace_id, _)| workspace_id),
        &refresh.hash,
        &family_id,
        refresh_expires_at,
        session.user_agent.map(truncate_agent).as_deref(),
        session.ip,
    )
    .await
    .map_err(internal)?;

    Ok(IssuedSession {
        access_token: access.token,
        access_expires_at: access.expires_at,
        refresh_token: refresh.raw,
        refresh_expires_at: refresh_expires_at.timestamp(),
        user_id: user_id.to_string(),
        workspace_id: scope.map(|(workspace_id, _)| workspace_id.to_string()),
        role: scope.map(|(_, role)| role),
    })
}

/// Stored for the user's own session list, never for authorization, so a
/// long or hostile value is simply cut short.
fn truncate_agent(agent: &str) -> String {
    agent.chars().take(200).collect()
}

pub(crate) async fn unique_slug(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    name: &str,
) -> Result<String> {
    let base = slugify(name);

    if !accounts::slug_exists(&mut **tx, &base)
        .await
        .map_err(internal)?
    {
        return Ok(base);
    }

    // A handful of attempts, then give up on a readable slug and use an id.
    // Looping until free would be an unbounded wait on a contended name.
    for suffix in 2..=20 {
        let candidate = format!("{base}-{suffix}");
        if !accounts::slug_exists(&mut **tx, &candidate)
            .await
            .map_err(internal)?
        {
            return Ok(candidate);
        }
    }

    Ok(format!("{base}-{}", cuid2::create_id()))
}

pub fn slugify(name: &str) -> String {
    let slug: String = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();

    let collapsed = slug
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if collapsed.is_empty() {
        // A name made entirely of characters that do not survive slugging,
        // which a non-Latin workspace name easily is.
        format!("w-{}", cuid2::create_id())
    } else {
        collapsed.chars().take(48).collect()
    }
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_slugify_ordinary_names() {
        assert_eq!(slugify("Demo Workspace"), "demo-workspace");
        assert_eq!(slugify("  Azlan's  Money  "), "azlan-s-money");
        assert_eq!(slugify("UPPER"), "upper");
    }

    #[test]
    fn should_collapse_runs_of_separators() {
        assert_eq!(slugify("a---b"), "a-b");
        assert_eq!(slugify("-leading and trailing-"), "leading-and-trailing");
    }

    #[test]
    fn should_fall_back_when_nothing_survives_slugging() {
        // A workspace named only in a non-Latin script would otherwise
        // produce an empty slug, and an empty slug is not unique.
        let slug = slugify("日本語");
        assert!(slug.starts_with("w-"));
        assert!(slug.len() > 2);
    }

    #[test]
    fn should_bound_slug_length() {
        assert!(slugify(&"a".repeat(200)).len() <= 48);
    }

    #[test]
    fn should_truncate_a_long_user_agent() {
        assert_eq!(truncate_agent(&"x".repeat(500)).len(), 200);
        assert_eq!(truncate_agent("Mozilla/5.0"), "Mozilla/5.0");
    }
}
