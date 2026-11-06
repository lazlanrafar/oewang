//! Converting the workspace currency against a real database (WAL-7, D105).

use oewang_domain::AppError;
use rust_decimal::Decimal;
use sqlx::PgPool;

use crate::{audit::Actor, workspaces::currency};

const WORKSPACE: &str = "ws_convert";
const OWNER: &str = "usr_convert";

fn dec(value: &str) -> Decimal {
    value.parse().unwrap()
}

/// id, wallet, to wallet, type, amount, to amount, base, rate, source, deleted.
type Row = (
    &'static str,
    &'static str,
    Option<&'static str>,
    &'static str,
    &'static str,
    Option<&'static str>,
    &'static str,
    &'static str,
    &'static str,
    bool,
);

async fn fixture(pool: &PgPool) {
    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'c@example.com', 'x')")
        .bind(OWNER)
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
    for (id, code) in [("w_idr", "IDR"), ("w_usd", "USD")] {
        sqlx::query(
            "INSERT INTO wallets (id, workspace_id, name, currency_code) VALUES ($1, $2, $1, $3)",
        )
        .bind(id)
        .bind(WORKSPACE)
        .bind(code)
        .execute(pool)
        .await
        .unwrap();
    }
    sqlx::query(
        "INSERT INTO categories (id, workspace_id, name, type) VALUES ('c_food', $1, 'Food', 'expense')",
    )
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO budgets (id, workspace_id, category_id, amount) VALUES ('b_food', $1, 'c_food', 2000000)")
        .bind(WORKSPACE)
        .execute(pool)
        .await
        .unwrap();

    let rows: [Row; 4] = [
        (
            "t_idr", "w_idr", None, "expense", "1000000", None, "1000000", "1", "same", false,
        ),
        (
            "t_usd", "w_usd", None, "expense", "10", None, "160000", "16000", "live", false,
        ),
        (
            "t_move",
            "w_idr",
            Some("w_usd"),
            "transfer",
            "500000",
            Some("31"),
            "500000",
            "1",
            "same",
            false,
        ),
        (
            "t_gone", "w_idr", None, "expense", "20000", None, "20000", "1", "same", true,
        ),
    ];
    for (id, wallet, to, kind, amount, to_amount, base, rate, source, deleted) in rows {
        sqlx::query(
            "INSERT INTO transactions
               (id, workspace_id, wallet_id, to_wallet_id, amount, to_amount, base_amount,
                base_rate, base_rate_source, base_rate_date, date, type, deleted_at)
             VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7::numeric, $8::numeric, $9,
                     '2026-10-01', '2026-10-01T00:00:00Z', $10,
                     CASE WHEN $11 THEN now() END)",
        )
        .bind(id)
        .bind(WORKSPACE)
        .bind(wallet)
        .bind(to)
        .bind(amount)
        .bind(to_amount)
        .bind(base)
        .bind(rate)
        .bind(source)
        .bind(kind)
        .bind(deleted)
        .execute(pool)
        .await
        .unwrap();
    }
}

async fn base_of(pool: &PgPool, id: &str) -> (Decimal, Decimal, String) {
    sqlx::query_as(
        "SELECT base_amount, base_rate, base_rate_source FROM transactions WHERE id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_reprice_every_row_and_budget_at_one_rate(pool: PgPool) {
    fixture(&pool).await;
    let actor = Actor::web(WORKSPACE, OWNER);

    let converted = currency::convert(&pool, actor, "usd", dec("0.00006"))
        .await
        .unwrap();
    assert_eq!(
        (converted.from.as_str(), converted.to.as_str()),
        ("IDR", "USD")
    );
    assert_eq!((converted.transactions, converted.budgets), (4, 1));

    // An IDR wallet's row takes the rate; the deleted one too.
    assert_eq!(
        base_of(&pool, "t_idr").await,
        (dec("60"), dec("0.00006"), "user".into())
    );
    assert_eq!(
        base_of(&pool, "t_move").await,
        (dec("30"), dec("0.00006"), "user".into())
    );
    assert_eq!(
        base_of(&pool, "t_gone").await,
        (dec("1.2"), dec("0.00006"), "user".into())
    );
    // A USD wallet's row is now in the workspace currency: no rate at all.
    assert_eq!(
        base_of(&pool, "t_usd").await,
        (dec("10"), dec("1"), "same".into())
    );

    let budget: Decimal = sqlx::query_scalar("SELECT amount FROM budgets WHERE id = 'b_food'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(budget, dec("120"));

    let (code, action): (String, String) = sqlx::query_as(
        "SELECT w.currency_code, a.action FROM workspaces w
         JOIN audit_logs a ON a.workspace_id = w.id WHERE w.id = $1",
    )
    .bind(WORKSPACE)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        (code.as_str(), action.as_str()),
        ("USD", "workspace.currency_converted")
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_rate_of_nothing_or_the_same_currency(pool: PgPool) {
    fixture(&pool).await;
    let actor = Actor::web(WORKSPACE, OWNER);

    for (code, rate, field) in [
        ("USD", "0", "rate"),
        ("USD", "-1", "rate"),
        ("IDR", "1", "currency_code"),
    ] {
        let error = currency::convert(&pool, actor, code, dec(rate))
            .await
            .unwrap_err();
        assert!(
            matches!(error, AppError::Validation(ref f) if f.contains_key(field)),
            "{code} {rate}"
        );
    }
    assert_eq!(base_of(&pool, "t_idr").await.0, dec("1000000"));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_preview_counts_and_the_newest_rate(pool: PgPool) {
    fixture(&pool).await;
    sqlx::query(
        "INSERT INTO exchange_rates (id, base_code, quote_code, date, rate)
         VALUES ('r1', 'IDR', 'USD', '2026-11-01', 0.0000598)",
    )
    .execute(&pool)
    .await
    .unwrap();

    let preview = currency::preview(&pool, WORKSPACE, "USD").await.unwrap();
    assert_eq!((preview.transactions, preview.budgets), (3, 1));
    assert_eq!(preview.suggested_rate, Some(dec("0.0000598")));
    assert_eq!(
        preview.rate_date.map(|d| d.to_string()).as_deref(),
        Some("2026-11-01")
    );
}
