//! Telegram links, link tokens, and handled updates.
//!
//! See docs/data-model.md#telegram. A link is the only thing that turns a
//! Telegram chat into a user in a workspace (D85), so every lookup here is
//! by something Telegram cannot forge on its own: the chat id the bot
//! received the update in, or the member the session token names.

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgExecutor;

/// `Serialize` is for the audit snapshot.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct TelegramLinkRow {
    pub id: String,
    pub workspace_id: String,
    pub user_id: String,
    pub chat_id: i64,
    pub telegram_user_id: i64,
    pub telegram_username: Option<String>,
    pub ai_session_id: Option<String>,
    pub linked_at: DateTime<Utc>,
}

pub struct NewLink<'a> {
    pub id: &'a str,
    pub workspace_id: &'a str,
    pub user_id: &'a str,
    pub chat_id: i64,
    pub telegram_user_id: i64,
    pub telegram_username: Option<&'a str>,
}

// ------------------------------------------------------------ link tokens

pub async fn insert_link_token(
    executor: impl PgExecutor<'_>,
    id: &str,
    workspace_id: &str,
    user_id: &str,
    token_hash: &str,
    expires_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO telegram_link_tokens (id, workspace_id, user_id, token_hash, expires_at)
           VALUES ($1, $2, $3, $4, $5)"#,
        id,
        workspace_id,
        user_id,
        token_hash,
        expires_at
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// Claim a token: valid, unexpired and unused, marked used in the same
/// statement so two `/start`s with one token cannot both link.
pub async fn claim_link_token(
    executor: impl PgExecutor<'_>,
    token_hash: &str,
) -> Result<Option<(String, String)>, sqlx::Error> {
    let row = sqlx::query!(
        r#"UPDATE telegram_link_tokens
           SET used_at = now()
           WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
           RETURNING workspace_id, user_id"#,
        token_hash
    )
    .fetch_optional(executor)
    .await?;

    Ok(row.map(|row| (row.workspace_id, row.user_id)))
}

// ------------------------------------------------------------------ links

pub async fn find_link_for_member(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    user_id: &str,
) -> Result<Option<TelegramLinkRow>, sqlx::Error> {
    sqlx::query_as!(
        TelegramLinkRow,
        r#"SELECT id, workspace_id, user_id, chat_id, telegram_user_id, telegram_username,
                  ai_session_id, linked_at
           FROM telegram_links
           WHERE workspace_id = $1 AND user_id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        user_id
    )
    .fetch_optional(executor)
    .await
}

/// The live link for a chat. Unscoped by design: the chat id is what an
/// update arrives with, and the row it finds is what scopes everything
/// after it.
pub async fn find_link_for_chat(
    executor: impl PgExecutor<'_>,
    chat_id: i64,
) -> Result<Option<TelegramLinkRow>, sqlx::Error> {
    sqlx::query_as!(
        TelegramLinkRow,
        r#"SELECT id, workspace_id, user_id, chat_id, telegram_user_id, telegram_username,
                  ai_session_id, linked_at
           FROM telegram_links
           WHERE chat_id = $1 AND deleted_at IS NULL"#,
        chat_id
    )
    .fetch_optional(executor)
    .await
}

pub async fn insert_link(
    executor: impl PgExecutor<'_>,
    link: NewLink<'_>,
) -> Result<TelegramLinkRow, sqlx::Error> {
    sqlx::query_as!(
        TelegramLinkRow,
        r#"INSERT INTO telegram_links
               (id, workspace_id, user_id, chat_id, telegram_user_id, telegram_username)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, workspace_id, user_id, chat_id, telegram_user_id, telegram_username,
                     ai_session_id, linked_at"#,
        link.id,
        link.workspace_id,
        link.user_id,
        link.chat_id,
        link.telegram_user_id,
        link.telegram_username
    )
    .fetch_one(executor)
    .await
}

pub async fn set_link_session(
    executor: impl PgExecutor<'_>,
    id: &str,
    session_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE telegram_links SET ai_session_id = $2, updated_at = now()
           WHERE id = $1 AND deleted_at IS NULL"#,
        id,
        session_id
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// End a member's link in one workspace. Returns what it ended, for the
/// audit row.
pub async fn soft_delete_link_for_member(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    user_id: &str,
) -> Result<Option<TelegramLinkRow>, sqlx::Error> {
    sqlx::query_as!(
        TelegramLinkRow,
        r#"UPDATE telegram_links SET deleted_at = now(), updated_at = now()
           WHERE workspace_id = $1 AND user_id = $2 AND deleted_at IS NULL
           RETURNING id, workspace_id, user_id, chat_id, telegram_user_id, telegram_username,
                     ai_session_id, linked_at"#,
        workspace_id,
        user_id
    )
    .fetch_optional(executor)
    .await
}

/// End whatever a chat is linked to, so it can be linked again elsewhere.
pub async fn soft_delete_link_for_chat(
    executor: impl PgExecutor<'_>,
    chat_id: i64,
) -> Result<Option<TelegramLinkRow>, sqlx::Error> {
    sqlx::query_as!(
        TelegramLinkRow,
        r#"UPDATE telegram_links SET deleted_at = now(), updated_at = now()
           WHERE chat_id = $1 AND deleted_at IS NULL
           RETURNING id, workspace_id, user_id, chat_id, telegram_user_id, telegram_username,
                     ai_session_id, linked_at"#,
        chat_id
    )
    .fetch_optional(executor)
    .await
}

/// End every link a user holds, in every workspace. What a password reset
/// and a sign-out everywhere do to sessions, done to chats as well.
pub async fn soft_delete_links_for_user(
    executor: impl PgExecutor<'_>,
    user_id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE telegram_links SET deleted_at = now(), updated_at = now()
           WHERE user_id = $1 AND deleted_at IS NULL"#,
        user_id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

// ---------------------------------------------------------------- updates

/// Claim an update id. `false` means it was handled already.
pub async fn claim_update(
    executor: impl PgExecutor<'_>,
    update_id: i64,
) -> Result<bool, sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO telegram_updates (update_id) VALUES ($1)
           ON CONFLICT (update_id) DO NOTHING"#,
        update_id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected() == 1)
}

/// Forget update ids older than the cutoff. Telegram keeps an unconfirmed
/// update for 24 hours, so anything past that can never come back.
pub async fn prune_updates(
    executor: impl PgExecutor<'_>,
    before: DateTime<Utc>,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"DELETE FROM telegram_updates WHERE received_at < $1"#,
        before
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}
