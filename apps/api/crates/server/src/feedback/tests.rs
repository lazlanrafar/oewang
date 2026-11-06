//! Feedback is stored with its sender and audited.

use oewang_domain::AppError;
use sqlx::PgPool;

use crate::{audit::Actor, feedback::service};

const WORKSPACE: &str = "ws_feedback";
const USER: &str = "usr_feedback";

async fn fixture(pool: &PgPool) {
    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'f@example.com', 'x')")
        .bind(USER)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ($1, $1, $1, 'IDR')",
    )
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_store_feedback_and_audit_it(pool: PgPool) {
    fixture(&pool).await;
    let actor = Actor::web(WORKSPACE, USER);

    let row = service::send(&pool, actor, "bug", "  The chart is empty.  ")
        .await
        .unwrap();
    assert_eq!(row.message, "The chart is empty.");

    let (user, kind): (String, String) =
        sqlx::query_as("SELECT user_id, type FROM feedback WHERE id = $1")
            .bind(&row.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((user.as_str(), kind.as_str()), (USER, "bug"));

    let action: String = sqlx::query_scalar("SELECT action FROM audit_logs WHERE entity_id = $1")
        .bind(&row.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(action, "feedback.sent");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_an_empty_long_or_unknown_feedback(pool: PgPool) {
    fixture(&pool).await;
    let actor = Actor::web(WORKSPACE, USER);
    let long = "x".repeat(service::MAX_MESSAGE_CHARS + 1);

    for (kind, message, field) in [
        ("bug", "   ", "message"),
        ("bug", long.as_str(), "message"),
        ("praise", "Nice", "type"),
    ] {
        let error = service::send(&pool, actor, kind, message)
            .await
            .unwrap_err();
        assert!(
            matches!(error, AppError::Validation(ref f) if f.contains_key(field)),
            "{kind}"
        );
    }
}
