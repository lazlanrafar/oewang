//! Linking a chat (D85), against a real database.
//!
//! The formatting and parsing rules are unit tested beside their code.
//! What is tested here is what only the rows can answer: that a token is
//! good once, for ten minutes, for the member it was minted for; that a
//! chat and a member each hold one live link; and that the ways out of a
//! workspace or an account end the link too.

use oewang_clients::{telegram::User, TelegramClient};
use oewang_db::repositories::telegram as repo;
use sqlx::PgPool;

use crate::{
    audit::Actor,
    telegram::{
        link::{self, Started},
        Bot,
    },
};

const WORKSPACE: &str = "ws_tg";
const USER: &str = "usr_tg";
const CHAT: i64 = 4242;

fn bot() -> Bot {
    Bot {
        // Never called: these tests stop before anything is sent.
        client: TelegramClient::new("http://127.0.0.1:9".into(), "1:test".into()),
        username: "OewangTestBot".into(),
    }
}

fn person(id: i64) -> User {
    User {
        id,
        is_bot: false,
        username: Some("budi".into()),
    }
}

async fn fixture(pool: &PgPool) {
    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'tg@example.com', 'x')")
        .bind(USER)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ($1, 'Home', 'home', 'IDR')",
    )
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO user_workspaces (id, workspace_id, user_id, role) VALUES ('m_tg', $1, $2, 'owner')",
    )
    .bind(WORKSPACE)
    .bind(USER)
    .execute(pool)
    .await
    .unwrap();
}

/// The `start` value of a fresh link.
async fn token(pool: &PgPool) -> String {
    let issued = link::issue(pool, &bot(), WORKSPACE, USER).await.unwrap();
    issued.deep_link.split("start=").nth(1).unwrap().to_string()
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_mint_a_start_value_telegram_accepts(pool: PgPool) {
    fixture(&pool).await;
    let issued = link::issue(&pool, &bot(), WORKSPACE, USER).await.unwrap();

    assert!(issued
        .deep_link
        .starts_with("https://t.me/OewangTestBot?start="));
    let start = issued.deep_link.split("start=").nth(1).unwrap();
    assert!(start.len() <= 64);
    assert!(start
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_link_the_chat_to_the_member_the_token_was_minted_for(pool: PgPool) {
    fixture(&pool).await;
    let start = token(&pool).await;

    let started = link::start(&pool, &start, CHAT, &person(77)).await.unwrap();
    assert!(matches!(started, Started::Linked { ref workspace_name } if workspace_name == "Home"));

    let row = repo::find_link_for_chat(&pool, CHAT)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.workspace_id, WORKSPACE);
    assert_eq!(row.user_id, USER);
    assert_eq!(row.telegram_user_id, 77);

    let status = link::status(&pool, Some(&bot()), WORKSPACE, USER)
        .await
        .unwrap();
    assert!(status.linked);
    assert_eq!(status.telegram_username.as_deref(), Some("budi"));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_token_used_twice(pool: PgPool) {
    fixture(&pool).await;
    let start = token(&pool).await;

    link::start(&pool, &start, CHAT, &person(77)).await.unwrap();
    let again = link::start(&pool, &start, 9999, &person(88)).await.unwrap();

    assert!(matches!(again, Started::Refused));
    assert!(repo::find_link_for_chat(&pool, 9999)
        .await
        .unwrap()
        .is_none());
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_an_expired_token(pool: PgPool) {
    fixture(&pool).await;
    let start = token(&pool).await;
    sqlx::query("UPDATE telegram_link_tokens SET expires_at = now() - interval '1 minute'")
        .execute(&pool)
        .await
        .unwrap();

    let started = link::start(&pool, &start, CHAT, &person(77)).await.unwrap();
    assert!(matches!(started, Started::Refused));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_value_nobody_minted(pool: PgPool) {
    fixture(&pool).await;
    // The old app's payload shape: a workspace slug and a user id.
    let started = link::start(&pool, "home___usr_tg", CHAT, &person(77))
        .await
        .unwrap();
    assert!(matches!(started, Started::Refused));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_bot_account(pool: PgPool) {
    fixture(&pool).await;
    let start = token(&pool).await;
    let mut sender = person(77);
    sender.is_bot = true;

    let started = link::start(&pool, &start, CHAT, &sender).await.unwrap();
    assert!(matches!(started, Started::Refused));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_keep_one_live_link_per_member_and_per_chat(pool: PgPool) {
    fixture(&pool).await;

    let first = token(&pool).await;
    link::start(&pool, &first, CHAT, &person(77)).await.unwrap();
    // The same member links a second chat: the first one stops.
    let second = token(&pool).await;
    link::start(&pool, &second, 5555, &person(77))
        .await
        .unwrap();

    assert!(repo::find_link_for_chat(&pool, CHAT)
        .await
        .unwrap()
        .is_none());
    assert!(repo::find_link_for_chat(&pool, 5555)
        .await
        .unwrap()
        .is_some());

    let live: i64 =
        sqlx::query_scalar("SELECT count(*) FROM telegram_links WHERE deleted_at IS NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(live, 1);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_end_the_link_from_the_apps_page_and_audit_it(pool: PgPool) {
    fixture(&pool).await;
    let start = token(&pool).await;
    link::start(&pool, &start, CHAT, &person(77)).await.unwrap();

    let ended = link::unlink(&pool, Actor::web(WORKSPACE, USER))
        .await
        .unwrap();
    assert!(ended.is_some());
    assert!(repo::find_link_for_chat(&pool, CHAT)
        .await
        .unwrap()
        .is_none());
    // Unlinking twice is not an error.
    assert!(link::unlink(&pool, Actor::web(WORKSPACE, USER))
        .await
        .unwrap()
        .is_none());

    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT action FROM audit_logs WHERE entity = 'telegram_link' ORDER BY created_at",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(actions, ["telegram.linked", "telegram.unlinked"]);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_end_every_link_when_the_user_signs_out_everywhere(pool: PgPool) {
    fixture(&pool).await;
    let start = token(&pool).await;
    link::start(&pool, &start, CHAT, &person(77)).await.unwrap();

    crate::auth::service::logout_everywhere(&pool, USER)
        .await
        .unwrap();

    assert!(repo::find_link_for_chat(&pool, CHAT)
        .await
        .unwrap()
        .is_none());
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_token_whose_member_left(pool: PgPool) {
    fixture(&pool).await;
    let start = token(&pool).await;
    sqlx::query("UPDATE user_workspaces SET deleted_at = now()")
        .execute(&pool)
        .await
        .unwrap();

    let started = link::start(&pool, &start, CHAT, &person(77)).await.unwrap();
    assert!(matches!(started, Started::Refused));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_claim_an_update_once(pool: PgPool) {
    assert!(repo::claim_update(&pool, 101).await.unwrap());
    assert!(!repo::claim_update(&pool, 101).await.unwrap());
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_accept_telegram_as_a_transaction_source(pool: PgPool) {
    // The CHECK constraint names every surface; a new one has to be in it.
    let allowed: bool = sqlx::query_scalar(
        "SELECT pg_get_constraintdef(oid) LIKE '%telegram%' FROM pg_constraint
         WHERE conname = 'transactions_source_check'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(allowed);
}
