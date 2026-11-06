//! Tests for the tool execution endpoint (US-029).
//!
//! Against a real database, because what is under test is not the parsing
//! (that is unit-tested in `oewang_domain::tools`) but the five gates in
//! front of a write and the rows that exist afterwards: the role read from
//! the membership table rather than the body, the caps, the confirmation
//! challenge, and the audit row attributed to the real user with
//! `source: "chat"`.

use oewang_domain::tools::{
    MAX_CREATED_TRANSACTIONS_PER_TURN, MAX_DELETES_PER_TURN, MAX_WRITES_PER_TURN,
};
use rust_decimal::Decimal;
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::ai::{
    tools::{self, ToolOutcome, ToolRequest},
    turns::TurnStore,
};

const WORKSPACE: &str = "ws_test";
const OTHER_WORKSPACE: &str = "ws_other";
const OWNER: &str = "usr_owner";
const MEMBER: &str = "usr_member";
const SESSION: &str = "ses_1";
const TURN: &str = "turn_1";

fn ceiling() -> Decimal {
    oewang_domain::tools::default_max_tool_amount()
}

fn store() -> TurnStore {
    let store = TurnStore::new();
    store.open(TURN, crate::owe1::session::now_secs());
    store
}

/// One call, for the owner, in the open turn.
async fn run(
    pool: &PgPool,
    turns: &TurnStore,
    tool: &str,
    args: Value,
) -> oewang_domain::Result<ToolOutcome> {
    call_as(pool, turns, OWNER, "owner", tool, args).await
}

async fn call_as(
    pool: &PgPool,
    turns: &TurnStore,
    user_id: &str,
    claimed_role: &str,
    tool: &str,
    args: Value,
) -> oewang_domain::Result<ToolOutcome> {
    tools::execute(
        pool,
        turns,
        ceiling(),
        ToolRequest {
            workspace_id: WORKSPACE,
            user_id,
            claimed_role,
            session_id: SESSION,
            turn_id: TURN,
            call_id: None,
            tool,
            args: &args,
        },
    )
    .await
}

async fn fixture(pool: &PgPool) {
    for (id, email) in [(OWNER, "owner@example.com"), (MEMBER, "member@example.com")] {
        sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'x')")
            .bind(id)
            .bind(email)
            .execute(pool)
            .await
            .unwrap();
    }

    for (id, slug) in [(WORKSPACE, "test"), (OTHER_WORKSPACE, "other")] {
        sqlx::query(
            "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ($1, 'Test', $2, 'IDR')",
        )
        .bind(id)
        .bind(slug)
        .execute(pool)
        .await
        .unwrap();
    }

    for (membership, user, role) in [("m_owner", OWNER, "owner"), ("m_member", MEMBER, "member")] {
        sqlx::query(
            "INSERT INTO user_workspaces (id, workspace_id, user_id, role)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(membership)
        .bind(WORKSPACE)
        .bind(user)
        .bind(role)
        .execute(pool)
        .await
        .unwrap();
    }

    sqlx::query(
        "INSERT INTO wallets (id, workspace_id, name, currency_code, balance, is_default)
         VALUES ('wal_cash', $1, 'Cash', 'IDR', 500000.0000, true)",
    )
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO wallets (id, workspace_id, name, currency_code, balance)
         VALUES ('wal_bank', $1, 'Bank', 'IDR', 1000000.0000)",
    )
    .bind(WORKSPACE)
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

async fn an_expense(pool: &PgPool, turns: &TurnStore, amount: &str, name: &str) -> String {
    let outcome = run(
        pool,
        turns,
        "create_transaction",
        json!({
            "type": "expense",
            "amount": amount,
            "wallet_id": "wal_cash",
            "category_id": "cat_food",
            "date": "2026-11-03",
            "name": name
        }),
    )
    .await
    .unwrap();

    outcome.result["id"].as_str().unwrap().to_string()
}

// -------------------------------------------------------------- the gates

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_tool_that_does_not_exist(pool: PgPool) {
    fixture(&pool).await;
    let error = run(
        &pool,
        &store(),
        "delete_wallet",
        json!({ "wallet_id": "wal_cash" }),
    )
    .await
    .unwrap_err();
    assert_eq!(error.code(), "TOOL_NOT_FOUND");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_read_the_role_from_the_membership_row_not_the_body(pool: PgPool) {
    fixture(&pool).await;

    // The body claims owner. The table says member, and the table wins.
    let error = call_as(
        &pool,
        &store(),
        MEMBER,
        "owner",
        "create_transaction",
        json!({ "type": "expense", "amount": "1000", "wallet_id": "wal_cash" }),
    )
    .await
    .unwrap_err();

    assert_eq!(error.code(), "TOOL_FORBIDDEN");

    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM transactions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0, "a refused write writes nothing");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_let_a_member_read(pool: PgPool) {
    fixture(&pool).await;

    let outcome = call_as(
        &pool,
        &store(),
        MEMBER,
        "member",
        "get_recent_transactions",
        json!({}),
    )
    .await
    .unwrap();

    assert_eq!(outcome.result["meta"]["returned"], json!(0));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_every_write_tool_for_a_member(pool: PgPool) {
    fixture(&pool).await;

    let calls = [
        (
            "create_transaction",
            json!({ "type": "expense", "amount": "1", "wallet_id": "wal_cash" }),
        ),
        (
            "update_transaction",
            json!({ "transaction_id": "txn_x", "name": "x" }),
        ),
        ("delete_transaction", json!({ "transaction_id": "txn_x" })),
        (
            "add_transaction_items",
            json!({ "transaction_id": "txn_x", "items": [{ "name": "x", "amount": "1" }] }),
        ),
        ("create_wallet", json!({ "name": "Wallet" })),
        (
            "create_category",
            json!({ "name": "Rent", "type": "expense" }),
        ),
    ];

    for (tool, args) in calls {
        let error = call_as(&pool, &store(), MEMBER, "member", tool, args)
            .await
            .unwrap_err();
        assert_eq!(error.code(), "TOOL_FORBIDDEN", "{tool}");
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_turn_the_api_never_opened(pool: PgPool) {
    fixture(&pool).await;

    // An empty store: no turn was ever opened.
    let error = tools::execute(
        &pool,
        &TurnStore::new(),
        ceiling(),
        ToolRequest {
            workspace_id: WORKSPACE,
            user_id: OWNER,
            claimed_role: "owner",
            session_id: SESSION,
            turn_id: "turn_invented",
            call_id: None,
            tool: "create_wallet",
            args: &json!({ "name": "Invented" }),
        },
    )
    .await
    .unwrap_err();

    assert_eq!(error.code(), "TOOL_FORBIDDEN");
}

// --------------------------------------------------------------- the caps

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_the_fourth_write_in_one_turn(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();

    for index in 0..MAX_WRITES_PER_TURN {
        run(
            &pool,
            &turns,
            "create_category",
            json!({ "name": format!("Cat {index}"), "type": "expense" }),
        )
        .await
        .unwrap();
    }

    let error = run(
        &pool,
        &turns,
        "create_category",
        json!({ "name": "Too many", "type": "expense" }),
    )
    .await
    .unwrap_err();
    assert_eq!(error.code(), "TOOL_CAP_EXCEEDED");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_the_fourth_transaction_created_in_one_turn(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();

    for index in 0..MAX_CREATED_TRANSACTIONS_PER_TURN {
        an_expense(&pool, &turns, "1000", &format!("Lunch {index}")).await;
    }

    let error = run(
        &pool,
        &turns,
        "create_transaction",
        json!({ "type": "expense", "amount": "1000", "wallet_id": "wal_cash" }),
    )
    .await
    .unwrap_err();
    assert_eq!(error.code(), "TOOL_CAP_EXCEEDED");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_second_delete_in_one_turn(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();

    let first = an_expense(&pool, &turns, "1000", "One").await;
    let second = an_expense(&pool, &turns, "2000", "Two").await;

    // Challenge then confirm, twice. The second delete is refused by the
    // cap rather than by the challenge.
    for id in [&first, &second] {
        assert_eq!(
            run(
                &pool,
                &turns,
                "delete_transaction",
                json!({ "transaction_id": id })
            )
            .await
            .unwrap_err()
            .code(),
            "CONFIRMATION_REQUIRED"
        );
    }

    run(
        &pool,
        &turns,
        "delete_transaction",
        json!({ "transaction_id": first, "confirmed": true }),
    )
    .await
    .unwrap();

    let error = run(
        &pool,
        &turns,
        "delete_transaction",
        json!({ "transaction_id": second, "confirmed": true }),
    )
    .await
    .unwrap_err();
    assert_eq!(error.code(), "TOOL_CAP_EXCEEDED");
    assert_eq!(MAX_DELETES_PER_TURN, 1);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_an_amount_above_the_ceiling(pool: PgPool) {
    fixture(&pool).await;

    let error = run(
        &pool,
        &store(),
        "create_transaction",
        json!({ "type": "expense", "amount": "1000000000000", "wallet_id": "wal_cash" }),
    )
    .await
    .unwrap_err();

    assert_eq!(error.code(), "TOOL_ARGS_INVALID");
    assert!(error.fields().unwrap().contains_key("amount"));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_line_item_above_the_ceiling(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    let id = an_expense(&pool, &turns, "1000", "Receipt").await;

    let error = run(
        &pool,
        &turns,
        "add_transaction_items",
        json!({
            "transaction_id": id,
            "items": [{ "name": "Suspicious", "amount": "9999999999" }]
        }),
    )
    .await
    .unwrap_err();

    assert_eq!(error.code(), "TOOL_ARGS_INVALID");
}

// ------------------------------------------------------- the confirmation

#[sqlx::test(migrations = "../../migrations")]
async fn should_challenge_a_delete_and_describe_the_row(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    let id = an_expense(&pool, &turns, "87500", "Warung Tekko").await;

    let error = run(
        &pool,
        &turns,
        "delete_transaction",
        json!({ "transaction_id": id }),
    )
    .await
    .unwrap_err();

    assert_eq!(error.code(), "CONFIRMATION_REQUIRED");
    let target = error.fields().unwrap();
    assert_eq!(target["name"], "Warung Tekko");
    assert_eq!(target["amount"], "Rp 87.500");
    assert_eq!(target["wallet"], "Cash");
    assert_eq!(target["date"], "2026-11-03");

    let live: i64 =
        sqlx::query_scalar("SELECT count(*) FROM transactions WHERE deleted_at IS NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(live, 1, "a challenge deletes nothing");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_not_honour_a_confirmed_flag_on_a_first_call(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    let id = an_expense(&pool, &turns, "1000", "Lunch").await;

    let error = run(
        &pool,
        &turns,
        "delete_transaction",
        json!({ "transaction_id": id, "confirmed": true }),
    )
    .await
    .unwrap_err();

    assert_eq!(error.code(), "CONFIRMATION_REQUIRED");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_not_carry_a_confirmation_to_another_row(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    let challenged = an_expense(&pool, &turns, "1000", "One").await;
    let other = an_expense(&pool, &turns, "2000", "Two").await;

    run(
        &pool,
        &turns,
        "delete_transaction",
        json!({ "transaction_id": challenged }),
    )
    .await
    .unwrap_err();

    let error = run(
        &pool,
        &turns,
        "delete_transaction",
        json!({ "transaction_id": other, "confirmed": true }),
    )
    .await
    .unwrap_err();

    assert_eq!(error.code(), "CONFIRMATION_REQUIRED");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_soft_delete_a_confirmed_transaction_and_restore_the_balance(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    let id = an_expense(&pool, &turns, "87500", "Warung Tekko").await;

    run(
        &pool,
        &turns,
        "delete_transaction",
        json!({ "transaction_id": id }),
    )
    .await
    .unwrap_err();
    let outcome = run(
        &pool,
        &turns,
        "delete_transaction",
        json!({ "transaction_id": id, "confirmed": true }),
    )
    .await
    .unwrap();

    assert_eq!(outcome.result["deleted"], json!(true));

    let deleted_at: Option<chrono::DateTime<chrono::Utc>> =
        sqlx::query_scalar("SELECT deleted_at FROM transactions WHERE id = $1")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(deleted_at.is_some(), "soft delete only (OPS-2)");

    let balance: Decimal = sqlx::query_scalar("SELECT balance FROM wallets WHERE id = 'wal_cash'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(balance, Decimal::new(5_000_000, 1), "the reversal is exact");
}

// ----------------------------------------------------------- happy paths

#[sqlx::test(migrations = "../../migrations")]
async fn should_create_a_transaction_and_move_the_balance(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();

    let outcome = run(
        &pool,
        &turns,
        "create_transaction",
        json!({
            "type": "expense",
            "amount": "87500",
            "wallet_id": "wal_cash",
            "category_id": "cat_food",
            "date": "2026-11-03",
            "name": "Warung Tekko"
        }),
    )
    .await
    .unwrap();

    assert_eq!(outcome.result["amount_formatted"], "Rp 87.500");
    assert_eq!(outcome.result["wallet"]["name"], "Cash");
    assert_eq!(outcome.result["category"]["name"], "Food");
    assert_eq!(outcome.summary, "Created expense of Rp 87.500 in Cash.");

    let balance: Decimal = sqlx::query_scalar("SELECT balance FROM wallets WHERE id = 'wal_cash'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(balance, Decimal::new(4_125_000, 1));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_attribute_a_chat_write_to_the_real_user(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    an_expense(&pool, &turns, "1000", "Lunch").await;

    let (user_id, source): (String, String) = sqlx::query_as(
        "SELECT user_id, source FROM audit_logs WHERE action = 'transaction.created'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(
        user_id, OWNER,
        "the audit row names the person, not the service"
    );
    assert_eq!(source, "chat");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_patch_only_the_fields_an_update_names(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    let id = an_expense(&pool, &turns, "87500", "Warung Tekko").await;

    let outcome = run(
        &pool,
        &turns,
        "update_transaction",
        json!({ "transaction_id": id, "amount": "90000" }),
    )
    .await
    .unwrap();

    assert_eq!(outcome.result["amount_formatted"], "Rp 90.000");
    assert_eq!(
        outcome.result["name"], "Warung Tekko",
        "an unnamed field keeps its value"
    );
    assert_eq!(outcome.result["category"]["name"], "Food");

    let balance: Decimal = sqlx::query_scalar("SELECT balance FROM wallets WHERE id = 'wal_cash'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        balance,
        Decimal::new(4_100_000, 1),
        "reversed and reapplied exactly"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_add_line_items(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    let id = an_expense(&pool, &turns, "87500", "Warung Tekko").await;

    let outcome = run(
        &pool,
        &turns,
        "add_transaction_items",
        json!({
            "transaction_id": id,
            "items": [
                { "name": "Nasi goreng", "amount": "45000", "quantity": "1" },
                { "name": "Es teh", "amount": "42500" }
            ]
        }),
    )
    .await
    .unwrap();

    assert_eq!(outcome.result["added"], json!(2));

    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM transaction_items")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 2);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_create_a_wallet_and_a_category(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();

    let wallet = run(&pool, &turns, "create_wallet", json!({ "name": "Wise" }))
        .await
        .unwrap();
    assert_eq!(
        wallet.result["currency_code"], "IDR",
        "absent means the workspace currency"
    );
    assert_eq!(wallet.result["balance_formatted"], "Rp 0");

    let category = run(
        &pool,
        &turns,
        "create_category",
        json!({ "name": "Rent", "type": "expense" }),
    )
    .await
    .unwrap();
    assert_eq!(category.result["type"], "expense");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_read_the_workspace_context_with_balances_already_formatted(pool: PgPool) {
    fixture(&pool).await;

    let outcome = run(&pool, &store(), "get_workspace_context", json!({}))
        .await
        .unwrap();

    assert_eq!(outcome.result["currency_code"], "IDR");
    assert_eq!(outcome.summary, "2 wallets and 2 categories.");

    let cash = outcome.result["wallets"]
        .as_array()
        .unwrap()
        .iter()
        .find(|wallet| wallet["name"] == "Cash")
        .expect("the Cash wallet is in the context");
    assert_eq!(cash["balance_formatted"], "Rp 500.000");
    assert_eq!(cash["is_default"], json!(true));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_search_by_name_and_by_amount(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    an_expense(&pool, &turns, "87500", "Warung Tekko").await;
    an_expense(&pool, &turns, "12000", "Kopi").await;

    let by_name = run(
        &pool,
        &turns,
        "search_transactions",
        json!({ "query": "warung" }),
    )
    .await
    .unwrap();
    assert_eq!(by_name.result["meta"]["returned"], json!(1));

    let by_amount = run(
        &pool,
        &turns,
        "search_transactions",
        json!({ "min_amount": "50000" }),
    )
    .await
    .unwrap();
    assert_eq!(by_amount.result["meta"]["returned"], json!(1));
    assert_eq!(by_amount.result["data"][0]["name"], "Warung Tekko");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_answer_a_question_without_touching_anything(pool: PgPool) {
    fixture(&pool).await;

    let outcome = run(
        &pool,
        &store(),
        "present_choices",
        json!({ "question": "Which wallet?", "choices": ["Cash", "Bank"] }),
    )
    .await
    .unwrap();

    assert_eq!(outcome.result["choices"][1], "Bank");
    assert_eq!(outcome.summary, "Which wallet?");
}

// ----------------------------------------------------------- the summary

#[sqlx::test(migrations = "../../migrations")]
async fn should_precompute_every_figure_in_a_summary(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();

    // November: 100,000 spent. October: 50,000, so the comparison doubles.
    for (date, amount, name) in [
        ("2026-11-03", "60000", "Warung Tekko"),
        ("2026-11-10", "40000", "Kopi"),
        ("2026-10-05", "50000", "Last month"),
    ] {
        tools::execute(
            &pool,
            // A fresh turn each time: three creates is the cap, and the
            // fixture needs more than the cap allows one turn to make.
            &store(),
            ceiling(),
            ToolRequest {
                workspace_id: WORKSPACE,
                user_id: OWNER,
                claimed_role: "owner",
                session_id: SESSION,
                turn_id: TURN,
                call_id: None,
                tool: "create_transaction",
                args: &json!({
                    "type": "expense",
                    "amount": amount,
                    "wallet_id": "wal_cash",
                    "category_id": "cat_food",
                    "date": date,
                    "name": name
                }),
            },
        )
        .await
        .unwrap();
    }

    let outcome = run(
        &pool,
        &turns,
        "get_spending_summary",
        json!({ "from": "2026-11-01", "to": "2026-11-30", "group_by": "category" }),
    )
    .await
    .unwrap();

    let result = &outcome.result;
    assert_eq!(result["spent_formatted"], "Rp 100.000");
    assert_eq!(result["comparison"]["spent_formatted"], "Rp 50.000");
    assert_eq!(result["comparison"]["change_formatted"], "+Rp 50.000");
    assert_eq!(result["comparison"]["percent_formatted"], "100%");
    assert_eq!(result["comparison"]["direction"], "up");
    assert_eq!(result["groups"][0]["label"], "Food");
    assert_eq!(result["groups"][0]["total_formatted"], "Rp 100.000");
    assert_eq!(result["groups"][0]["share_formatted"], "100%");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_leave_a_percentage_out_when_there_is_nothing_to_compare(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    an_expense(&pool, &turns, "50000", "Only month").await;

    let outcome = run(
        &pool,
        &turns,
        "get_spending_summary",
        json!({ "from": "2026-11-01", "to": "2026-11-30", "group_by": "wallet" }),
    )
    .await
    .unwrap();

    assert_eq!(outcome.result["comparison"]["percent"], Value::Null);
    assert_eq!(outcome.result["comparison"]["direction"], "up");
    assert_eq!(outcome.result["groups"][0]["label"], "Cash");
}

/// No tool may return a figure the model would have to combine.
///
/// Walks every result this suite produces and asserts that any key holding
/// a bare decimal has a formatted twin beside it. A new tool that forgets
/// one fails here rather than in a wrong sentence (D27).
#[sqlx::test(migrations = "../../migrations")]
async fn should_pair_every_raw_figure_with_a_formatted_one(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    an_expense(&pool, &turns, "87500", "Warung Tekko").await;

    let results = [
        run(&pool, &turns, "get_workspace_context", json!({}))
            .await
            .unwrap()
            .result,
        run(&pool, &turns, "get_recent_transactions", json!({}))
            .await
            .unwrap()
            .result,
        run(
            &pool,
            &turns,
            "get_spending_summary",
            json!({ "from": "2026-11-01", "to": "2026-11-30", "group_by": "category" }),
        )
        .await
        .unwrap()
        .result,
    ];

    for result in results {
        assert_unformatted_figures_are_paired(&result);
    }
}

/// Every key whose value is a decimal string must have a `_formatted`
/// sibling, except the ones that are not money.
fn assert_unformatted_figures_are_paired(value: &Value) {
    const NOT_MONEY: [&str; 6] = ["id", "count", "returned", "percent", "share_percent", "key"];

    match value {
        Value::Object(map) => {
            for (key, child) in map {
                let is_decimal = child
                    .as_str()
                    .is_some_and(|raw| raw.parse::<Decimal>().is_ok());

                if is_decimal && !NOT_MONEY.contains(&key.as_str()) && !key.ends_with("_formatted")
                {
                    assert!(
                        map.contains_key(&format!("{key}_formatted")),
                        "{key} is a bare figure with no formatted twin"
                    );
                }

                assert_unformatted_figures_are_paired(child);
            }
        }
        Value::Array(items) => items.iter().for_each(assert_unformatted_figures_are_paired),
        _ => {}
    }
}

// ----------------------------------------------------------- the envelope

#[sqlx::test(migrations = "../../migrations")]
async fn should_not_reach_another_workspace(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    let id = an_expense(&pool, &turns, "1000", "Ours").await;

    let error = tools::execute(
        &pool,
        &turns,
        ceiling(),
        ToolRequest {
            workspace_id: OTHER_WORKSPACE,
            user_id: OWNER,
            claimed_role: "owner",
            session_id: SESSION,
            turn_id: TURN,
            call_id: None,
            tool: "update_transaction",
            args: &json!({ "transaction_id": id, "name": "Theirs" }),
        },
    )
    .await
    .unwrap_err();

    // Not a member there, so the role gate answers before the row is
    // looked for. Either way the row is untouched.
    assert_eq!(error.code(), "NOT_A_MEMBER");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_say_when_a_list_was_cut(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();

    // Two rows, asked for one: the page is short and the result says so.
    an_expense(&pool, &turns, "1000", "One").await;
    an_expense(&pool, &turns, "2000", "Two").await;

    let outcome = run(
        &pool,
        &turns,
        "get_recent_transactions",
        json!({ "limit": 1 }),
    )
    .await
    .unwrap();

    assert_eq!(outcome.result["meta"]["returned"], json!(1));
    assert_eq!(outcome.result["meta"]["has_next_page"], json!(true));
    assert_eq!(outcome.result["meta"]["truncated"], json!(false));
}

// ----------------------------------------------------------- the settings

/// US-032. The role gate is the `AuthWrite` extractor on the route, like
/// every other write, so what is tested here is the rest: the lazy row, the
/// patch semantics and the two validations.
mod settings {
    use super::*;
    use crate::{ai::service, audit::Actor};

    fn actor() -> Actor<'static> {
        Actor::web(WORKSPACE, OWNER)
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_read_the_defaults_before_anything_is_saved(pool: PgPool) {
        fixture(&pool).await;

        let row = service::settings(&pool, WORKSPACE).await.unwrap();
        assert_eq!(row.response_language, "auto");
        assert!(row.custom_instructions.is_none());

        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM ai_agent_settings")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0, "reading does not create the row");
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_create_the_row_on_the_first_edit(pool: PgPool) {
        fixture(&pool).await;

        let row = service::update_settings(
            &pool,
            actor(),
            Some("Always answer in short bullets."),
            Some("indonesian"),
        )
        .await
        .unwrap();

        assert_eq!(
            row.custom_instructions.as_deref(),
            Some("Always answer in short bullets.")
        );
        assert_eq!(row.response_language, "indonesian");
        assert_eq!(
            service::settings(&pool, WORKSPACE)
                .await
                .unwrap()
                .response_language,
            "indonesian"
        );
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_leave_an_absent_field_alone(pool: PgPool) {
        fixture(&pool).await;
        service::update_settings(&pool, actor(), Some("Keep it brief."), Some("english"))
            .await
            .unwrap();

        let row = service::update_settings(&pool, actor(), None, Some("auto"))
            .await
            .unwrap();
        assert_eq!(row.custom_instructions.as_deref(), Some("Keep it brief."));
        assert_eq!(row.response_language, "auto");
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_clear_the_instructions_with_an_empty_string(pool: PgPool) {
        fixture(&pool).await;
        service::update_settings(&pool, actor(), Some("Keep it brief."), None)
            .await
            .unwrap();

        let row = service::update_settings(&pool, actor(), Some("   "), None)
            .await
            .unwrap();
        assert!(row.custom_instructions.is_none());
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_refuse_a_language_that_is_not_offered(pool: PgPool) {
        fixture(&pool).await;

        let error = service::update_settings(&pool, actor(), None, Some("klingon"))
            .await
            .unwrap_err();
        assert_eq!(error.code(), "VALIDATION_FAILED");
        assert!(error.fields().unwrap().contains_key("response_language"));
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_refuse_instructions_too_long_to_carry_every_turn(pool: PgPool) {
        fixture(&pool).await;

        let long = "a".repeat(2_001);
        let error = service::update_settings(&pool, actor(), Some(&long), None)
            .await
            .unwrap_err();
        assert_eq!(error.code(), "VALIDATION_FAILED");
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_record_the_change_without_recording_the_text(pool: PgPool) {
        fixture(&pool).await;
        service::update_settings(&pool, actor(), Some("A secret house rule."), None)
            .await
            .unwrap();

        let after: serde_json::Value =
            sqlx::query_scalar("SELECT after FROM audit_logs WHERE action = 'ai_settings.updated'")
                .fetch_one(&pool)
                .await
                .unwrap();

        assert_eq!(after["has_custom_instructions"], json!(true));
        assert!(
            !after.to_string().contains("secret house rule"),
            "the trail records that it changed, not what it says (OPS-3)"
        );
    }

    /// The settings reach the prompt through the turn body, so a change
    /// here is visible on the next turn without anything else happening.
    #[sqlx::test(migrations = "../../migrations")]
    async fn should_reach_the_next_turn(pool: PgPool) {
        fixture(&pool).await;
        service::update_settings(&pool, actor(), Some("Answer in bullets."), Some("english"))
            .await
            .unwrap();

        let session = service::create(&pool, actor(), None).await.unwrap();
        let turn = service::begin_turn(
            &pool,
            WORKSPACE,
            OWNER,
            oewang_domain::Role::Owner,
            &session.id,
            "How much did I spend?",
            &[],
        )
        .await
        .unwrap();

        assert_eq!(
            turn.settings.custom_instructions.as_deref(),
            Some("Answer in bullets.")
        );
        assert_eq!(turn.settings.response_language, "english");
        assert!(
            !turn.turn_id.is_empty(),
            "every turn carries its own budget id"
        );
    }
}
