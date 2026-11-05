//! Linking a Telegram chat to a member, and ending that link (D85).
//!
//! The old app linked whoever sent `/start <workspace-slug>`, so knowing a
//! slug was enough to read and write another workspace's money. Here the
//! `start` value is a token minted for one member, from a page that member
//! is signed in to: random, hashed at rest, ten minutes, single use, the
//! same rules as a password reset token (AUTH-8). Whoever opens the deep
//! link first, in a private chat, is linked. The token is shown on the
//! member's own screen and nowhere else.

use chrono::{DateTime, Duration as ChronoDuration, Utc};
use oewang_clients::telegram::User;
use oewang_db::{
    repositories::{
        accounts,
        telegram::{self as repo, NewLink, TelegramLinkRow},
    },
    PgPool,
};
use oewang_domain::{AppError, Result};
use serde::Serialize;
use sqlx::PgExecutor;

use crate::{
    audit::{log, snapshot, Actor, SOURCE_TELEGRAM},
    auth::{service::current_role, token},
    telegram::Bot,
};

const ENTITY: &str = "telegram_link";

/// How long a link from the Apps page stays usable.
pub const LINK_TOKEN_TTL_MINUTES: i64 = 10;

/// What the Apps page shows for the signed-in member.
#[derive(Debug, Serialize)]
pub struct LinkStatus {
    /// False when this server runs without a bot.
    pub enabled: bool,
    pub bot_username: Option<String>,
    pub linked: bool,
    pub telegram_username: Option<String>,
    pub linked_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub struct IssuedLink {
    /// `https://t.me/<bot>?start=<token>`. Carries the token, so it is shown
    /// to the member and never put in an app URL or a log.
    pub deep_link: String,
    pub expires_at: DateTime<Utc>,
}

pub async fn status(
    pool: &PgPool,
    bot: Option<&Bot>,
    workspace_id: &str,
    user_id: &str,
) -> Result<LinkStatus> {
    let link = repo::find_link_for_member(pool, workspace_id, user_id)
        .await
        .map_err(internal)?;

    Ok(LinkStatus {
        enabled: bot.is_some(),
        bot_username: bot.map(|bot| bot.username.clone()),
        linked: link.is_some(),
        telegram_username: link.as_ref().and_then(|row| row.telegram_username.clone()),
        linked_at: link.map(|row| row.linked_at),
    })
}

/// Mint a one-time link for this member in this workspace.
///
/// Any member may link: a `member` can ask the assistant from Telegram as
/// they can on the web, and every write is re-checked per message.
pub async fn issue(
    pool: &PgPool,
    bot: &Bot,
    workspace_id: &str,
    user_id: &str,
) -> Result<IssuedLink> {
    // 32 random bytes as URL-safe base64: 43 characters of [A-Za-z0-9_-],
    // inside Telegram's 64-character `start` limit and its alphabet.
    let issued = token::issue_refresh_token();
    let expires_at = Utc::now() + ChronoDuration::minutes(LINK_TOKEN_TTL_MINUTES);

    repo::insert_link_token(
        pool,
        &cuid2::create_id(),
        workspace_id,
        user_id,
        &issued.hash,
        expires_at,
    )
    .await
    .map_err(internal)?;

    Ok(IssuedLink {
        deep_link: bot.deep_link(&issued.raw),
        expires_at,
    })
}

/// What `/start <token>` came to.
pub enum Started {
    Linked {
        workspace_name: String,
    },
    /// Unknown, expired or already used, or its member left the workspace.
    /// One answer for all of them: telling them apart helps nobody but
    /// someone guessing tokens.
    Refused,
}

/// Bind this chat to the token's member.
///
/// The chat must be private and the sender a person: a group would let
/// every member of the group act as the one who linked it.
pub async fn start(pool: &PgPool, raw_token: &str, chat_id: i64, from: &User) -> Result<Started> {
    if raw_token.is_empty() || raw_token.len() > 64 || from.is_bot {
        return Ok(Started::Refused);
    }

    let mut tx = pool.begin().await.map_err(internal)?;

    let Some((workspace_id, user_id)) =
        repo::claim_link_token(&mut *tx, &token::hash_token(raw_token))
            .await
            .map_err(internal)?
    else {
        return Ok(Started::Refused);
    };

    // The token outlived nothing it should not have: a member removed
    // after opening the Apps page cannot link with the link they were shown.
    if current_role(pool, &workspace_id, &user_id).await.is_err() {
        tx.commit().await.map_err(internal)?;
        return Ok(Started::Refused);
    }

    let actor = Actor {
        workspace_id: &workspace_id,
        user_id: &user_id,
        source: SOURCE_TELEGRAM,
    };

    // One chat, one link: whatever this chat acted for before stops now.
    if let Some(previous) = repo::soft_delete_link_for_chat(&mut *tx, chat_id)
        .await
        .map_err(internal)?
    {
        unlinked(&mut tx, &previous).await?;
    }
    // One link per member per workspace: linking a second chat moves it.
    if let Some(previous) = repo::soft_delete_link_for_member(&mut *tx, &workspace_id, &user_id)
        .await
        .map_err(internal)?
    {
        unlinked(&mut tx, &previous).await?;
    }

    let link = repo::insert_link(
        &mut *tx,
        NewLink {
            id: &cuid2::create_id(),
            workspace_id: &workspace_id,
            user_id: &user_id,
            chat_id,
            telegram_user_id: from.id,
            telegram_username: from.username.as_deref(),
        },
    )
    .await
    .map_err(internal)?;

    log(
        &mut tx,
        actor,
        "telegram.linked",
        ENTITY,
        &link.id,
        None,
        snapshot(&link)?,
    )
    .await?;

    let workspace_name = accounts::find_workspace(&mut *tx, &workspace_id)
        .await
        .map_err(internal)?
        .map(|workspace| workspace.name)
        .unwrap_or_default();

    tx.commit().await.map_err(internal)?;

    Ok(Started::Linked { workspace_name })
}

/// End the member's link from the Apps page. Ending one that does not
/// exist is not an error: the page asked for "not linked", and it is.
pub async fn unlink(pool: &PgPool, actor: Actor<'_>) -> Result<Option<TelegramLinkRow>> {
    let mut tx = pool.begin().await.map_err(internal)?;

    let ended = repo::soft_delete_link_for_member(&mut *tx, actor.workspace_id, actor.user_id)
        .await
        .map_err(internal)?;

    if let Some(row) = &ended {
        log(
            &mut tx,
            actor,
            "telegram.unlinked",
            ENTITY,
            &row.id,
            snapshot(row)?,
            None,
        )
        .await?;
    }

    tx.commit().await.map_err(internal)?;
    Ok(ended)
}

/// End a link because its member is no longer allowed to use it: they left
/// the workspace. Audited as the member, from Telegram, where it was found.
pub async fn revoke(pool: &PgPool, link: &TelegramLinkRow) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;
    if let Some(row) =
        repo::soft_delete_link_for_member(&mut *tx, &link.workspace_id, &link.user_id)
            .await
            .map_err(internal)?
    {
        unlinked(&mut tx, &row).await?;
    }
    tx.commit().await.map_err(internal)
}

/// End every link a user holds. Called by
/// a password reset and by signing out everywhere: both exist to cut off
/// whoever might hold the old credentials, and a linked chat is one.
pub async fn revoke_all_for_user(executor: impl PgExecutor<'_>, user_id: &str) -> Result<u64> {
    repo::soft_delete_links_for_user(executor, user_id)
        .await
        .map_err(internal)
}

/// End a member's link in one workspace, inside the caller's transaction.
/// Called when the member is removed: the membership row the link acts
/// through is gone, so the link goes with it.
pub async fn revoke_member(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    user_id: &str,
) -> Result<()> {
    repo::soft_delete_link_for_member(executor, workspace_id, user_id)
        .await
        .map(|_| ())
        .map_err(internal)
}

async fn unlinked(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    row: &TelegramLinkRow,
) -> Result<()> {
    log(
        tx,
        Actor {
            workspace_id: &row.workspace_id,
            user_id: &row.user_id,
            source: SOURCE_TELEGRAM,
        },
        "telegram.unlinked",
        ENTITY,
        &row.id,
        snapshot(row)?,
        None,
    )
    .await
}

fn internal(error: impl Into<anyhow::Error>) -> AppError {
    AppError::Internal(error.into())
}
