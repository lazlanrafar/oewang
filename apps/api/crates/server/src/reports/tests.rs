//! Report tests.
//!
//! The range arithmetic is pure and tested as such. The builders run against
//! a real database, because what matters there is which rows a sum takes:
//! the workspace, the soft delete, the range ends and the type.

use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::{
    ai::{
        tools::{self, ToolRequest},
        turns::TurnStore,
    },
    reports::service::{self, DayRange},
};

const WORKSPACE: &str = "ws_test";
const OTHER_WORKSPACE: &str = "ws_other";
const OWNER: &str = "usr_owner";
const TURN: &str = "turn_1";

fn day(raw: &str) -> NaiveDate {
    raw.parse().unwrap()
}

fn range(from: &str, to: &str) -> DayRange {
    DayRange::new(day(from), day(to)).unwrap()
}

fn dec(raw: &str) -> Decimal {
    raw.parse().unwrap()
}

// ------------------------------------------------------------------- range

#[test]
fn should_list_every_month_a_range_touches() {
    assert_eq!(
        range("2025-11-15", "2026-02-03").months(),
        ["2025-11", "2025-12", "2026-01", "2026-02"]
    );
    assert_eq!(range("2026-03-01", "2026-03-31").months(), ["2026-03"]);
}

#[test]
fn should_refuse_a_reversed_or_overlong_range() {
    assert_eq!(
        DayRange::new(day("2026-02-01"), day("2026-01-01"))
            .unwrap_err()
            .code(),
        "VALIDATION_FAILED"
    );
    assert_eq!(
        DayRange::new(day("2020-01-01"), day("2026-01-01"))
            .unwrap_err()
            .code(),
        "VALIDATION_FAILED"
    );
}

#[test]
fn should_compare_with_the_period_of_equal_length_before() {
    let previous = range("2026-11-01", "2026-11-30").previous();
    assert_eq!(previous, range("2026-10-02", "2026-10-31"));
}

#[test]
fn should_move_a_leap_day_to_the_28th_a_year_earlier() {
    let before = range("2028-02-01", "2028-02-29").year_before();
    assert_eq!(before, range("2027-02-01", "2027-02-28"));
}

#[test]
fn should_average_over_every_month_including_empty_ones() {
    assert_eq!(service::average(dec("300"), dec("4")), dec("75"));
    assert_eq!(service::average(dec("100"), Decimal::ZERO), Decimal::ZERO);
}

#[test]
fn should_name_the_direction_rather_than_leave_a_sign_to_read() {
    assert_eq!(service::direction(dec("-1")), "down");
    assert_eq!(service::direction(Decimal::ZERO), "flat");
    assert_eq!(service::direction(dec("2")), "up");
    assert_eq!(service::percent_change(Decimal::ZERO, dec("5")), None);
    assert_eq!(
        service::percent_change(dec("200"), dec("50")),
        Some(dec("25.0"))
    );
}

// ---------------------------------------------------------------- builders

async fn fixture(pool: &PgPool) {
    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'o@example.com', 'x')")
        .bind(OWNER)
        .execute(pool)
        .await
        .unwrap();

    for (id, slug) in [(WORKSPACE, "test"), (OTHER_WORKSPACE, "other")] {
        sqlx::query(
            "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ($1, 'Test', $2, 'IDR')",
        )
        .bind(id)
        .bind(slug)
        .execute(pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO wallets (id, workspace_id, name, currency_code, balance, is_default)
             VALUES ($1, $2, 'Cash', 'IDR', 0, true)",
        )
        .bind(format!("wal_{id}"))
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
    }

    sqlx::query(
        "INSERT INTO user_workspaces (id, workspace_id, user_id, role)
         VALUES ('m_owner', $1, $2, 'owner')",
    )
    .bind(WORKSPACE)
    .bind(OWNER)
    .execute(pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO categories (id, workspace_id, name, type)
         VALUES ('cat_food', $1, 'Food', 'expense'), ('cat_pay', $1, 'Salary', 'income')",
    )
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();
}

/// A row written straight to the table: what is under test is the read.
async fn row(
    pool: &PgPool,
    workspace_id: &str,
    kind: &str,
    amount: &str,
    date: &str,
    category: Option<&str>,
    deleted: bool,
) {
    sqlx::query(
        "INSERT INTO transactions
             (id, workspace_id, wallet_id, category_id, amount, base_amount, base_rate,
              base_rate_source, base_rate_date, date, type, name, deleted_at)
         VALUES ($1, $2, $3, $4, $5::numeric, $5::numeric, 1, 'same', $6::date,
                 ($6::date + time '12:00') AT TIME ZONE 'UTC', $7, $8,
                 CASE WHEN $9 THEN now() END)",
    )
    .bind(cuid2::create_id())
    .bind(workspace_id)
    .bind(format!("wal_{workspace_id}"))
    .bind(category)
    .bind(amount)
    .bind(date)
    .bind(kind)
    .bind(format!("{kind} {amount}"))
    .bind(deleted)
    .execute(pool)
    .await
    .unwrap();
}

async fn ledger(pool: &PgPool) {
    fixture(pool).await;
    // Inside the range.
    row(
        pool,
        WORKSPACE,
        "expense",
        "100000",
        "2026-09-10",
        Some("cat_food"),
        false,
    )
    .await;
    row(
        pool,
        WORKSPACE,
        "expense",
        "50000",
        "2026-11-30",
        None,
        false,
    )
    .await;
    row(
        pool,
        WORKSPACE,
        "income",
        "400000",
        "2026-11-01",
        Some("cat_pay"),
        false,
    )
    .await;
    // The period before.
    row(
        pool,
        WORKSPACE,
        "expense",
        "75000",
        "2026-08-15",
        Some("cat_food"),
        false,
    )
    .await;
    // Deleted, and another workspace: neither counts.
    row(
        pool,
        WORKSPACE,
        "expense",
        "999999",
        "2026-10-10",
        None,
        true,
    )
    .await;
    row(
        pool,
        OTHER_WORKSPACE,
        "expense",
        "888888",
        "2026-10-10",
        None,
        false,
    )
    .await;
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_build_the_overview_from_this_workspace_only(pool: PgPool) {
    ledger(&pool).await;

    let view = service::overview(&pool, WORKSPACE, range("2026-09-01", "2026-11-30"))
        .await
        .unwrap();

    assert_eq!(view.expense.value, dec("150000"));
    assert_eq!(view.expense.value_formatted, "Rp 150.000");
    assert_eq!(view.income.value, dec("400000"));
    assert_eq!(view.net.value, dec("250000"));
    assert_eq!(view.net.value_formatted, "+Rp 250.000");

    // 2026-06-03 to 2026-08-31 is the period before; only the August row.
    assert_eq!(view.expense.comparison.previous, dec("75000"));
    assert_eq!(view.expense.comparison.percent, Some(dec("100.0")));
    assert_eq!(view.expense.comparison.direction, "up");

    // October is empty and still there, as zero.
    let months: Vec<(&str, Decimal)> = view
        .months
        .iter()
        .map(|point| (point.month.as_str(), point.expense))
        .collect();
    assert_eq!(
        months,
        [
            ("2026-09", dec("100000")),
            ("2026-10", Decimal::ZERO),
            ("2026-11", dec("50000"))
        ]
    );
    assert_eq!(view.average_expense, dec("50000"));

    let names: Vec<Option<&str>> = view
        .expense_categories
        .iter()
        .map(|share| share.name.as_deref())
        .collect();
    assert_eq!(names, [Some("Food"), None]);
    assert_eq!(
        view.expense_categories[0].share_formatted.as_deref(),
        Some("66.7%")
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_list_the_largest_expenses_with_their_share(pool: PgPool) {
    ledger(&pool).await;

    let view = service::spending(&pool, WORKSPACE, range("2026-09-01", "2026-11-30"))
        .await
        .unwrap();

    assert_eq!(view.count, 2);
    assert_eq!(view.largest.len(), 2);
    assert_eq!(view.largest[0].amount, dec("100000"));
    assert_eq!(view.largest[0].category_name.as_deref(), Some("Food"));
    assert_eq!(view.largest[0].share_formatted.as_deref(), Some("66.7%"));
}

// ------------------------------------------------------------------- tools

async fn analyse(pool: &PgPool, turns: &TurnStore, tool: &str, args: Value) -> Value {
    tools::execute(
        pool,
        turns,
        oewang_domain::tools::default_max_tool_amount(),
        ToolRequest {
            workspace_id: WORKSPACE,
            user_id: OWNER,
            claimed_role: "owner",
            session_id: "ses_1",
            turn_id: TURN,
            call_id: Some("call_1"),
            tool,
            args: &args,
        },
    )
    .await
    .unwrap()
    .result
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_leave_an_artifact_for_every_analysis_with_data(pool: PgPool) {
    ledger(&pool).await;

    for (tool, kind) in [
        ("get_spending_analysis", "spending"),
        ("get_income_summary", "income"),
        ("get_burn_rate", "burn-rate"),
    ] {
        let turns = TurnStore::new();
        turns.open(TURN, crate::owe1::session::now_secs());

        let result = analyse(
            &pool,
            &turns,
            tool,
            json!({ "from": "2026-09-01", "to": "2026-11-30" }),
        )
        .await;

        assert_eq!(result["canvas"], true, "{tool}");
        assert!(result.get("previous_year").is_none(), "{tool}");

        let artifact = turns.take_artifact(TURN, "call_1").expect(tool);
        assert_eq!(artifact.kind, kind);
        assert_eq!(artifact.payload["currency_code"], "IDR");
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_leave_no_artifact_for_an_empty_range(pool: PgPool) {
    ledger(&pool).await;
    let turns = TurnStore::new();
    turns.open(TURN, crate::owe1::session::now_secs());

    let result = analyse(
        &pool,
        &turns,
        "get_spending_analysis",
        json!({ "from": "2020-01-01", "to": "2020-01-31" }),
    )
    .await;

    assert_eq!(result["canvas"], false);
    assert!(turns.take_artifact(TURN, "call_1").is_none());
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_count_the_whole_last_day_of_a_tool_range(pool: PgPool) {
    ledger(&pool).await;
    let turns = TurnStore::new();
    turns.open(TURN, crate::owe1::session::now_secs());

    // The 50,000 row sits at noon on the 30th. A range ending at the 30th's
    // first moment would miss it.
    let result = analyse(
        &pool,
        &turns,
        "get_spending_analysis",
        json!({ "from": "2026-11-01", "to": "2026-11-30" }),
    )
    .await;

    assert_eq!(result["total"]["value_formatted"], "Rp 50.000");
}
