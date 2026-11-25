//! One update, from the JSON Telegram sends to the rows and replies it
//! leaves (TG-2, TG-4, TG-5, TG-10).
//!
//! Each test hands `poller::handle` an update exactly as `getUpdates`
//! returns it. The Bot API and the AI service are real servers on local
//! ports (`crate::test_support`), so the order of the checks in
//! `message.rs` is tested by what reached Telegram and what reached the
//! database, not by which function was called.

use oewang_clients::{
    telegram::{Update, User},
    TelegramClient,
};
use oewang_db::repositories::telegram as links;
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::{
    hardening_tests::Capture,
    state::AppState,
    telegram::{link, poller, render, Bot},
    test_support::{self, TelegramStub, NOWHERE},
};

const WORKSPACE: &str = "ws_tu";
const USER: &str = "usr_tu";
const CHAT: i64 = 4242;
const SENDER: i64 = 77;
/// The shape BotFather hands out, distinctive enough that a substring
/// match cannot pass by accident.
const TOKEN: &str = "7012345678:AAH-bot-token-Qx9VzLm3Kp";

async fn fixture(pool: &PgPool) {
    for sql in [
        "INSERT INTO users (id, email, password_hash) VALUES ('usr_tu', 'tu@example.com', 'x')",
        "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ('ws_tu', 'Home', 'home', 'IDR')",
        "INSERT INTO user_workspaces (id, workspace_id, user_id, role) VALUES ('m_tu', 'ws_tu', 'usr_tu', 'owner')",
        "INSERT INTO wallets (id, workspace_id, name, currency_code, is_default) VALUES ('w_cash', 'ws_tu', 'Cash', 'IDR', true)",
        "INSERT INTO categories (id, workspace_id, name, type) VALUES ('c_food', 'ws_tu', 'Food', 'expense')",
    ] {
        sqlx::query(sql).execute(pool).await.unwrap();
    }
}

fn bot(url: &str) -> Bot {
    Bot {
        client: TelegramClient::new(url.into(), TOKEN.into()),
        username: "OewangTestBot".into(),
    }
}

/// A live link from `CHAT` to the member, opened by Telegram account
/// `SENDER`, the way the deep link opens it.
async fn linked(pool: &PgPool) {
    let issued = link::issue(pool, &bot(NOWHERE), WORKSPACE, USER)
        .await
        .unwrap();
    let start = issued.deep_link.split("start=").nth(1).unwrap();
    let sender = User {
        id: SENDER,
        is_bot: false,
        username: Some("budi".into()),
    };
    link::start(pool, start, CHAT, &sender).await.unwrap();
}

fn update(chat_type: &str, from: Value, content: Value) -> Update {
    let mut message = json!({
        "message_id": 10,
        "date": 1_763_900_000,
        "chat": { "id": CHAT, "type": chat_type },
        "from": from,
    });
    message
        .as_object_mut()
        .unwrap()
        .extend(content.as_object().unwrap().clone());
    serde_json::from_value(json!({ "update_id": 1, "message": message })).unwrap()
}

fn person(id: i64) -> Value {
    json!({ "id": id, "is_bot": false, "first_name": "Budi" })
}

fn text(body: &str) -> Value {
    json!({ "text": body })
}

/// A photo as Telegram sends one: the same picture at several sizes.
fn photo(caption: &str) -> Value {
    json!({
        "caption": caption,
        "photo": [
            { "file_id": "small", "file_unique_id": "s", "width": 90, "height": 120 },
            { "file_id": "large", "file_unique_id": "l", "width": 900, "height": 1200 },
        ],
    })
}

fn jpeg() -> Vec<u8> {
    let mut bytes = std::io::Cursor::new(Vec::new());
    image::RgbImage::from_pixel(8, 8, image::Rgb([200, 120, 40]))
        .write_to(&mut bytes, image::ImageFormat::Jpeg)
        .unwrap();
    bytes.into_inner()
}

async fn count(pool: &PgPool, sql: &'static str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

/// The AI service's answers for a readable receipt: two items that add up
/// to the total, and the category picked by name.
fn readable(path: &str, _: &Value) -> Value {
    match path {
        "/receipt/parse" => json!({
            "draft": {
                "merchant": "Warung Budi",
                "date": "2026-11-20",
                "currency": "IDR",
                "total": "45000",
                "line_items": [
                    { "name": "Nasi goreng", "amount": "30000", "quantity": "1", "unit_price": "30000" },
                    { "name": "Es teh", "amount": "15000", "quantity": "1", "unit_price": "15000" },
                ],
            },
            "quality": { "score": 95 },
            "usage": { "input": 1200, "output": 80, "model": "test-model" },
        }),
        _ => json!({ "category": "Food", "usage": { "input": 40, "output": 2 } }),
    }
}

/// A date and no total: nothing to save.
fn no_total(_: &str, _: &Value) -> Value {
    json!({ "draft": { "date": "2026-11-20", "currency": "IDR" }, "quality": { "score": 30 } })
}

async fn running(pool: &PgPool, answer: fn(&str, &Value) -> Value) -> (AppState, TelegramStub) {
    let ai = test_support::ai_service(pool.clone(), answer).await;
    let state = test_support::state(pool.clone(), &ai);
    (state, TelegramStub::serve(jpeg()).await)
}

// ------------------------------------------------------------------- TG-2

/// TG-2: a valid token sent in a group links nothing, and the group is
/// told once why.
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_link_started_in_a_group(pool: PgPool) {
    fixture(&pool).await;
    let (state, telegram) = running(&pool, readable).await;
    let issued = link::issue(&pool, &bot(NOWHERE), WORKSPACE, USER)
        .await
        .unwrap();
    let start = issued.deep_link.split("start=").nth(1).unwrap().to_string();

    let start = text(&format!("/start {start}"));
    poller::handle(
        &state,
        &bot(&telegram.url),
        update("group", person(SENDER), start),
    )
    .await;

    assert_eq!(telegram.texts(), [render::PRIVATE_ONLY]);
    assert!(links::find_link_for_chat(&pool, CHAT)
        .await
        .unwrap()
        .is_none());
}

/// TG-2: anything else in a group is not addressed to the bot, even from
/// the linked account and with a receipt in it.
#[sqlx::test(migrations = "../../migrations")]
async fn should_ignore_a_receipt_sent_in_a_group(pool: PgPool) {
    fixture(&pool).await;
    linked(&pool).await;
    let (state, telegram) = running(&pool, readable).await;

    let group = update("supergroup", person(SENDER), photo(""));
    poller::handle(&state, &bot(&telegram.url), group).await;

    assert!(telegram.methods().is_empty(), "{:?}", telegram.methods());
    assert_eq!(count(&pool, "SELECT count(*) FROM transactions").await, 0);
}

/// TG-2: the chat is linked, but the link is for the Telegram account that
/// opened it. Someone else writing in the same chat id is not the member.
#[sqlx::test(migrations = "../../migrations")]
async fn should_not_act_for_another_telegram_account_in_a_linked_chat(pool: PgPool) {
    fixture(&pool).await;
    linked(&pool).await;
    let (state, telegram) = running(&pool, readable).await;

    poller::handle(
        &state,
        &bot(&telegram.url),
        update("private", person(88), photo("")),
    )
    .await;

    assert_eq!(telegram.texts(), [render::NOT_LINKED]);
    assert!(!telegram.methods().contains(&"getFile".to_string()));
    assert_eq!(count(&pool, "SELECT count(*) FROM transactions").await, 0);
}

/// TG-2: a bot account is never a sender, not even with the linked id.
#[sqlx::test(migrations = "../../migrations")]
async fn should_ignore_a_message_from_a_bot_account(pool: PgPool) {
    fixture(&pool).await;
    linked(&pool).await;
    let (state, telegram) = running(&pool, readable).await;

    let from = json!({ "id": SENDER, "is_bot": true, "first_name": "Bot" });
    poller::handle(
        &state,
        &bot(&telegram.url),
        update("private", from, photo("")),
    )
    .await;

    assert!(telegram.methods().is_empty(), "{:?}", telegram.methods());
    assert_eq!(count(&pool, "SELECT count(*) FROM transactions").await, 0);
}

// ------------------------------------------------------------------- TG-4

/// TG-4: the role is read again for this update, not remembered from the
/// link. An owner demoted to member since linking cannot save a receipt.
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_receipt_from_a_member_who_can_no_longer_write(pool: PgPool) {
    fixture(&pool).await;
    linked(&pool).await;
    sqlx::query("UPDATE user_workspaces SET role = 'member'")
        .execute(&pool)
        .await
        .unwrap();
    let (state, telegram) = running(&pool, readable).await;

    poller::handle(
        &state,
        &bot(&telegram.url),
        update("private", person(SENDER), photo("")),
    )
    .await;

    assert_eq!(telegram.texts(), [render::MEMBER_CANNOT_WRITE]);
    assert!(!telegram.methods().contains(&"getFile".to_string()));
    assert_eq!(count(&pool, "SELECT count(*) FROM vault_files").await, 0);
    assert_eq!(count(&pool, "SELECT count(*) FROM transactions").await, 0);
}

/// TG-4: a member who left is disconnected by their next message.
#[sqlx::test(migrations = "../../migrations")]
async fn should_disconnect_a_member_who_left_the_workspace(pool: PgPool) {
    fixture(&pool).await;
    linked(&pool).await;
    sqlx::query("UPDATE user_workspaces SET deleted_at = now()")
        .execute(&pool)
        .await
        .unwrap();
    let (state, telegram) = running(&pool, readable).await;

    poller::handle(
        &state,
        &bot(&telegram.url),
        update("private", person(SENDER), text("hi")),
    )
    .await;

    assert_eq!(telegram.texts(), [render::NO_LONGER_MEMBER]);
    assert!(links::find_link_for_chat(&pool, CHAT)
        .await
        .unwrap()
        .is_none());
}

// ------------------------------------------------------------------- TG-5

/// TG-5: a photo becomes an expense in the default IDR account, with its
/// items, its category and the photo attached, and the reply carries the
/// buttons that undo or recategorize it.
#[sqlx::test(migrations = "../../migrations")]
async fn should_save_a_receipt_photo_as_an_expense_with_items_and_the_file(pool: PgPool) {
    fixture(&pool).await;
    linked(&pool).await;
    let (state, telegram) = running(&pool, readable).await;

    poller::handle(
        &state,
        &bot(&telegram.url),
        update("private", person(SENDER), photo("")),
    )
    .await;

    // The largest size is the one fetched.
    assert_eq!(telegram.bodies("getFile")[0]["file_id"], "large");

    let (kind, wallet, category, amount, name, source): (
        String,
        String,
        Option<String>,
        String,
        String,
        String,
    ) = sqlx::query_as(
        "SELECT type, wallet_id, category_id, amount::text, name, source
             FROM transactions WHERE workspace_id = $1 AND deleted_at IS NULL",
    )
    .bind(WORKSPACE)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        (
            kind.as_str(),
            wallet.as_str(),
            category.as_deref(),
            name.as_str(),
            source.as_str()
        ),
        (
            "expense",
            "w_cash",
            Some("c_food"),
            "Warung Budi",
            "telegram"
        )
    );
    assert_eq!(
        amount.parse::<rust_decimal::Decimal>().unwrap(),
        rust_decimal::Decimal::from(45_000)
    );

    let items: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM transaction_items WHERE deleted_at IS NULL ORDER BY name",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(items, ["Es teh", "Nasi goreng"]);

    // The attachment is the photo itself, through the vault.
    let (status, size): (String, i64) = sqlx::query_as(
        "SELECT f.status, f.size FROM transaction_attachments a
         JOIN vault_files f ON f.id = a.vault_file_id
         WHERE a.deleted_at IS NULL",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!((status.as_str(), size), ("ready", jpeg().len() as i64));

    let replies = telegram.bodies("sendMessage");
    let last = replies.last().unwrap();
    assert!(
        last["text"].as_str().unwrap().contains("Warung Budi"),
        "{last}"
    );
    assert!(last["reply_markup"]["inline_keyboard"]
        .as_array()
        .is_some_and(|rows| !rows.is_empty()));

    // Every model call is on the usage ledger, for the member (USG-2): the
    // read, the categories of the items history did not know (TXN-27), and
    // the receipt's own category.
    let features: Vec<(String, Option<String>)> =
        sqlx::query_as("SELECT feature, user_id FROM ai_usage ORDER BY feature")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        features,
        [
            ("categorize".to_string(), Some(USER.to_string())),
            ("categorize".to_string(), Some(USER.to_string())),
            ("receipt".to_string(), Some(USER.to_string())),
        ]
    );
}

/// TG-5: a receipt with no readable total is not saved; the photo stays in
/// the vault and the user is asked for a better one.
#[sqlx::test(migrations = "../../migrations")]
async fn should_not_save_a_receipt_without_a_total(pool: PgPool) {
    fixture(&pool).await;
    linked(&pool).await;
    let (state, telegram) = running(&pool, no_total).await;

    poller::handle(
        &state,
        &bot(&telegram.url),
        update("private", person(SENDER), photo("")),
    )
    .await;

    assert_eq!(
        telegram.texts().last().map(String::as_str),
        Some(render::RECEIPT_UNREADABLE)
    );
    assert_eq!(count(&pool, "SELECT count(*) FROM transactions").await, 0);
}

/// TG-5, D95: the reader did not answer. The photo is kept and queued for
/// the same chat, and nothing is saved yet.
#[sqlx::test(migrations = "../../migrations")]
async fn should_queue_a_receipt_the_reader_did_not_answer(pool: PgPool) {
    fixture(&pool).await;
    linked(&pool).await;
    let state = test_support::state(pool.clone(), NOWHERE);
    let telegram = TelegramStub::serve(jpeg()).await;

    poller::handle(
        &state,
        &bot(&telegram.url),
        update("private", person(SENDER), photo("")),
    )
    .await;

    assert_eq!(
        telegram.texts().last().map(String::as_str),
        Some(render::QUEUED)
    );
    let (channel, chat_id, status): (String, Option<i64>, String) =
        sqlx::query_as("SELECT channel, chat_id, status FROM receipt_jobs")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        (channel.as_str(), chat_id, status.as_str()),
        ("telegram", Some(CHAT), "pending")
    );
    assert_eq!(count(&pool, "SELECT count(*) FROM transactions").await, 0);
}

// ------------------------------------------------------------------ TG-10

const CAPTION: &str = "caption-lunch-with-Sari-7Hq2";
const SAID: &str = "message-my-salary-is-9Wd4";

/// TG-10: run the paths that carry Telegram content and the bot token
/// (a receipt with a caption, text from a stranger, a reply that cannot be
/// delivered) under a captured log sink, and find none of it there.
#[sqlx::test(migrations = "../../migrations")]
async fn should_keep_telegram_content_and_the_token_out_of_the_logs(pool: PgPool) {
    fixture(&pool).await;
    linked(&pool).await;
    let (state, telegram) = running(&pool, readable).await;

    let sink = Capture::default();
    let collector = tracing_subscriber::fmt()
        .with_writer(sink.clone())
        .with_max_level(tracing::Level::TRACE)
        .finish();
    let guard = tracing::subscriber::set_default(collector);

    let live = bot(&telegram.url);
    poller::handle(
        &state,
        &live,
        update("private", person(SENDER), photo(CAPTION)),
    )
    .await;
    poller::handle(&state, &live, update("private", person(88), text(SAID))).await;
    // Telegram unreachable: the reply's failure is logged, its URL is not.
    poller::handle(
        &state,
        &bot(NOWHERE),
        update("private", person(88), text(SAID)),
    )
    .await;

    drop(guard);
    let logs = sink.text();

    assert!(
        logs.contains("telegram reply not sent"),
        "the workload logged nothing:\n{logs}"
    );
    for secret in [TOKEN, CAPTION, SAID, "Warung Budi", "Nasi goreng"] {
        assert!(
            !logs.contains(secret),
            "{secret} reached the log sink:\n{logs}"
        );
    }
    // The token's secret half alone is still the token.
    assert!(!logs.contains(TOKEN.split_once(':').unwrap().1));
}
