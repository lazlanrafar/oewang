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
/// Where a person's answer to a challenge arrives: never the turn that asked.
const NEXT_TURN: &str = "turn_2";

fn ceiling() -> Decimal {
    oewang_domain::tools::default_max_tool_amount()
}

fn store() -> TurnStore {
    let store = TurnStore::new();
    store.open(TURN, crate::owe1::session::now_secs());
    store.open(NEXT_TURN, crate::owe1::session::now_secs());
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

/// One call, for the owner, in the turn after the one that asked.
async fn answer(
    pool: &PgPool,
    turns: &TurnStore,
    tool: &str,
    args: Value,
) -> oewang_domain::Result<ToolOutcome> {
    call_in(pool, turns, OWNER, "owner", NEXT_TURN, tool, args).await
}

async fn call_as(
    pool: &PgPool,
    turns: &TurnStore,
    user_id: &str,
    claimed_role: &str,
    tool: &str,
    args: Value,
) -> oewang_domain::Result<ToolOutcome> {
    call_in(pool, turns, user_id, claimed_role, TURN, tool, args).await
}

async fn call_in(
    pool: &PgPool,
    turns: &TurnStore,
    user_id: &str,
    claimed_role: &str,
    turn_id: &str,
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
            turn_id,
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

/// The AI service retries a call once after a transport error, with a fresh
/// request id. A write that already landed must not land twice.
#[sqlx::test(migrations = "../../migrations")]
async fn should_answer_a_repeated_write_call_with_its_first_outcome(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    let args = json!({
        "type": "expense", "amount": "1000", "wallet_id": "wal_cash",
        "category_id": "cat_food", "date": "2026-11-03", "name": "Lunch"
    });
    let request = || ToolRequest {
        workspace_id: WORKSPACE,
        user_id: OWNER,
        claimed_role: "owner",
        session_id: SESSION,
        turn_id: TURN,
        call_id: Some("call_1"),
        tool: "create_transaction",
        args: &args,
    };

    let first = tools::execute(&pool, &turns, ceiling(), request())
        .await
        .unwrap();
    let again = tools::execute(&pool, &turns, ceiling(), request())
        .await
        .unwrap();

    assert_eq!(again.result, first.result);
    let rows = count(
        &pool,
        "SELECT count(*) FROM transactions WHERE deleted_at IS NULL",
    )
    .await;
    assert_eq!(rows, 1, "one write, not two");
}

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

/// TXN-15
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

    answer(
        &pool,
        &turns,
        "delete_transaction",
        json!({ "transaction_id": first, "confirmed": true }),
    )
    .await
    .unwrap();

    let error = answer(
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

/// SEC-24
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

/// SEC-25
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

/// SEC-25: the model cannot answer its own challenge. The person answers
/// between turns, so a confirmation inside the turn that asked is asked again.
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_confirmation_in_the_turn_that_asked(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    let id = an_expense(&pool, &turns, "1000", "Lunch").await;

    let ask = json!({ "transaction_id": id });
    let error = run(&pool, &turns, "delete_transaction", ask).await;
    assert_eq!(error.unwrap_err().code(), "CONFIRMATION_REQUIRED");

    let confirmed = json!({ "transaction_id": id, "confirmed": true });
    let error = run(&pool, &turns, "delete_transaction", confirmed).await;
    assert_eq!(error.unwrap_err().code(), "CONFIRMATION_REQUIRED");

    let live = count(
        &pool,
        "SELECT count(*) FROM transactions WHERE deleted_at IS NULL",
    )
    .await;
    assert_eq!(live, 1, "nothing deleted");
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
    let outcome = answer(
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

/// D129
#[sqlx::test(migrations = "../../migrations")]
async fn should_store_the_names_a_chat_create_writes_tidied(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();

    run(
        &pool,
        &turns,
        "create_transaction",
        json!({
            "type": "expense",
            "amount": "30000",
            "wallet_id": "wal_cash",
            "date": "2026-11-03",
            "name": "jus  alpukat dede",
            "items": [{ "name": "ES TEH POCI", "amount": "30000" }]
        }),
    )
    .await
    .unwrap();

    let names: (String, String) = sqlx::query_as(
        "SELECT t.name, i.name FROM transactions t
         JOIN transaction_items i ON i.transaction_id = t.id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(names, ("Jus Alpukat Dede".into(), "Es Teh Poci".into()));
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

/// CHAT-15
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
/// CHAT-15
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

/// A debt payment paid through `wal_cash`, for the delete-route tests.
async fn a_debt_payment(pool: &PgPool) -> (String, String) {
    use crate::{
        audit::Actor,
        contacts::service::{self as contacts, ContactInput},
        debts::service::{self as debts, DebtInput, PayInput},
    };
    let actor = Actor::web(WORKSPACE, OWNER);
    let contact = ContactInput {
        name: "Budi",
        email: None,
        phone: None,
        note: None,
    };
    let (contact, _) = contacts::create_with_id(pool, actor, None, contact)
        .await
        .unwrap();
    let debt = DebtInput {
        kind: "payable",
        contact_id: &contact.id,
        amount: "1000".parse().unwrap(),
        currency_code: None,
        due_date: None,
        description: None,
        source_transaction_id: None,
    };
    let (debt, _) = debts::create_with_id(pool, actor, None, debt)
        .await
        .unwrap();
    let pay = PayInput {
        amount: "1000".parse().unwrap(),
        wallet_id: Some("wal_cash"),
        date: chrono::Utc::now(),
        exchange_rate: None,
    };
    let (paid, _) = debts::pay(pool, actor, &debt.id, None, pay).await.unwrap();
    (debt.id, paid.transaction.unwrap().id)
}

/// DEBT-8: the chat's `delete_transaction` cancels the payment it deletes.
#[sqlx::test(migrations = "../../migrations")]
async fn should_cancel_a_debt_payment_deleted_through_the_chat_tool(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    let (debt_id, transaction_id) = a_debt_payment(&pool).await;

    let challenge = run(
        &pool,
        &turns,
        "delete_transaction",
        json!({ "transaction_id": transaction_id }),
    )
    .await
    .unwrap_err();
    assert_eq!(challenge.code(), "CONFIRMATION_REQUIRED");
    answer(
        &pool,
        &turns,
        "delete_transaction",
        json!({ "transaction_id": transaction_id, "confirmed": true }),
    )
    .await
    .unwrap();

    let debt = crate::debts::service::find(&pool, WORKSPACE, &debt_id)
        .await
        .unwrap();
    assert_eq!(debt.status, "unpaid");
    assert_eq!(debt.remaining_amount, "1000".parse::<Decimal>().unwrap());
}

// ------------------------------------------------------------------ debts

/// A debt the chat recorded, by name.
async fn a_debt(pool: &PgPool, turns: &TurnStore, kind: &str, name: &str, amount: &str) -> String {
    let outcome = run(
        pool,
        turns,
        "create_debt",
        json!({ "type": kind, "contact_name": name, "amount": amount }),
    )
    .await
    .unwrap();
    outcome.result["id"].as_str().unwrap().to_string()
}

async fn count(pool: &PgPool, sql: &'static str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

/// DEBT-14
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_every_debt_write_for_a_member(pool: PgPool) {
    fixture(&pool).await;

    let calls = [
        (
            "create_debt",
            json!({ "type": "payable", "contact_name": "Budi", "amount": "1" }),
        ),
        ("pay_debt", json!({ "debt_id": "debt_x", "amount": "1" })),
        ("update_debt", json!({ "debt_id": "debt_x", "amount": "2" })),
        ("delete_debt", json!({ "debt_id": "debt_x" })),
        (
            "split_bill",
            json!({ "amount": "300", "name": "Dinner", "contact_names": ["Ani"] }),
        ),
    ];
    for (tool, args) in calls {
        let error = call_as(&pool, &store(), MEMBER, "member", tool, args)
            .await
            .unwrap_err();
        assert_eq!(error.code(), "TOOL_FORBIDDEN", "{tool}");
    }

    let reads = call_as(
        &pool,
        &store(),
        MEMBER,
        "member",
        "get_outstanding_debts",
        json!({}),
    )
    .await;
    assert!(reads.is_ok(), "a member reads the debts");
}

/// DEBT-14: a contact named in a call is matched case-insensitively, or
/// created once, and the write is the chat's.
#[sqlx::test(migrations = "../../migrations")]
async fn should_record_a_debt_against_a_contact_named_in_the_call(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();

    let first = a_debt(&pool, &turns, "receivable", "Budi", "50000").await;
    let second = a_debt(&pool, &turns, "payable", " budi ", "20000").await;

    let contacts = count(
        &pool,
        "SELECT count(*) FROM contacts WHERE workspace_id = 'ws_test' AND deleted_at IS NULL",
    )
    .await;
    assert_eq!(contacts, 1, "the second name matched the first contact");

    let first = crate::debts::service::find(&pool, WORKSPACE, &first)
        .await
        .unwrap();
    let second = crate::debts::service::find(&pool, WORKSPACE, &second)
        .await
        .unwrap();
    assert_eq!(first.contact_id, second.contact_id);
    assert_eq!(
        first.currency_code, "IDR",
        "the workspace currency by default"
    );
    assert_eq!(first.status, "unpaid");

    let source: String = sqlx::query_scalar(
        "SELECT source FROM audit_logs WHERE entity = 'debt' AND entity_id = $1",
    )
    .bind(&first.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(source, "chat");
}

/// DEBT-14: a refused debt leaves no contact behind.
#[sqlx::test(migrations = "../../migrations")]
async fn should_not_make_a_contact_for_a_debt_it_refuses(pool: PgPool) {
    fixture(&pool).await;

    let error = run(
        &pool,
        &store(),
        "create_debt",
        json!({ "type": "payable", "contact_name": "Citra", "amount": "0" }),
    )
    .await
    .unwrap_err();
    assert_eq!(error.code(), "VALIDATION_FAILED");
    assert_eq!(count(&pool, "SELECT count(*) FROM contacts").await, 0);
}

/// DEBT-14: the outstanding list leaves out a paid debt and carries the
/// totals as the API formatted them.
#[sqlx::test(migrations = "../../migrations")]
async fn should_list_only_the_debts_still_owed(pool: PgPool) {
    fixture(&pool).await;
    let turns = store();
    let open = a_debt(&pool, &turns, "receivable", "Ani", "50000").await;
    let settled = a_debt(&pool, &turns, "payable", "Budi", "10000").await;
    run(
        &pool,
        &store(),
        "pay_debt",
        json!({ "debt_id": settled, "amount": "10000" }),
    )
    .await
    .unwrap();

    let outcome = run(&pool, &store(), "get_outstanding_debts", json!({}))
        .await
        .unwrap();
    let debts = outcome.result["debts"].as_array().unwrap();
    assert_eq!(debts.len(), 1);
    assert_eq!(debts[0]["id"], open);
    assert_eq!(debts[0]["remaining"], "50000.0000");
    assert!(outcome.result["totals"]["owed_to_you"].is_string());
}

/// DEBT-14, DEBT-4: a payment without a wallet goes through the default
/// one, writes its transaction and counts as a transaction created.
#[sqlx::test(migrations = "../../migrations")]
async fn should_pay_a_debt_through_the_default_wallet(pool: PgPool) {
    fixture(&pool).await;
    let debt = a_debt(&pool, &store(), "payable", "Budi", "100000").await;

    let outcome = run(
        &pool,
        &store(),
        "pay_debt",
        json!({ "debt_id": debt, "amount": "40000" }),
    )
    .await
    .unwrap();
    assert_eq!(outcome.result["wallet"], "Cash");
    assert_eq!(outcome.result["debt"]["status"], "partial");
    assert_eq!(outcome.result["debt"]["remaining"], "60000.0000");

    let balance: Decimal = sqlx::query_scalar("SELECT balance FROM wallets WHERE id = 'wal_cash'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        balance,
        "460000".parse::<Decimal>().unwrap(),
        "paying a payable is an expense"
    );

    // The fourth transaction in a turn is refused, a payment included.
    let turns = store();
    for _ in 0..MAX_CREATED_TRANSACTIONS_PER_TURN {
        run(
            &pool,
            &turns,
            "pay_debt",
            json!({ "debt_id": debt, "amount": "1" }),
        )
        .await
        .unwrap();
    }
    let error = run(
        &pool,
        &turns,
        "pay_debt",
        json!({ "debt_id": debt, "amount": "1" }),
    )
    .await
    .unwrap_err();
    assert_eq!(error.code(), "TOOL_CAP_EXCEEDED");
}

/// DEBT-14, DEBT-5: in another currency the ceiling holds on what leaves
/// the wallet, not on the figure the model typed.
#[sqlx::test(migrations = "../../migrations")]
async fn should_hold_a_foreign_payment_to_the_ceiling_on_its_wallet_amount(pool: PgPool) {
    fixture(&pool).await;
    sqlx::query(
        "INSERT INTO exchange_rates (id, base_code, quote_code, date, rate)
         VALUES ('rate_usd', 'USD', 'IDR', CURRENT_DATE, 16000)",
    )
    .execute(&pool)
    .await
    .unwrap();
    let created = run(
        &pool,
        &store(),
        "create_debt",
        json!({ "type": "payable", "contact_name": "Sam", "amount": "100", "currency_code": "USD" }),
    )
    .await
    .unwrap();
    let debt = created.result["id"].as_str().unwrap().to_string();

    let args = json!({ "debt_id": debt, "amount": "100" });
    let low_ceiling = tools::execute(
        &pool,
        &store(),
        "1000000".parse().unwrap(),
        ToolRequest {
            workspace_id: WORKSPACE,
            user_id: OWNER,
            claimed_role: "owner",
            session_id: SESSION,
            turn_id: TURN,
            call_id: None,
            tool: "pay_debt",
            args: &args,
        },
    )
    .await
    .unwrap_err();
    assert_eq!(
        low_ceiling.code(),
        "TOOL_ARGS_INVALID",
        "1,600,000 IDR is above it"
    );

    let paid = run(&pool, &store(), "pay_debt", args.clone())
        .await
        .unwrap();
    assert_eq!(paid.result["debt"]["status"], "paid");
    let (amount, original): (Decimal, Decimal) =
        sqlx::query_as("SELECT amount, original_amount FROM transactions WHERE id = $1")
            .bind(paid.result["transaction_id"].as_str().unwrap())
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(amount, "1600000".parse::<Decimal>().unwrap());
    assert_eq!(original, "100".parse::<Decimal>().unwrap());
}

/// DEBT-14, DEBT-2: the service's rules reach the model unchanged.
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_an_amount_below_what_was_paid(pool: PgPool) {
    fixture(&pool).await;
    let debt = a_debt(&pool, &store(), "receivable", "Ani", "100000").await;
    run(
        &pool,
        &store(),
        "pay_debt",
        json!({ "debt_id": debt, "amount": "80000" }),
    )
    .await
    .unwrap();

    let error = run(
        &pool,
        &store(),
        "update_debt",
        json!({ "debt_id": debt, "amount": "50000" }),
    )
    .await
    .unwrap_err();
    assert_eq!(error.code(), "AMOUNT_BELOW_PAID");

    let updated = run(
        &pool,
        &store(),
        "update_debt",
        json!({ "debt_id": debt, "description": "Concert tickets", "due_date": "2026-12-24" }),
    )
    .await
    .unwrap();
    assert_eq!(updated.result["description"], "Concert tickets");
    assert_eq!(updated.result["due_date"], "2026-12-24");
}

/// DEBT-14: a debt delete is challenged with the debt's own details, and a
/// challenge on a transaction id never answers for a debt.
#[sqlx::test(migrations = "../../migrations")]
async fn should_challenge_a_debt_delete_and_keep_it_apart(pool: PgPool) {
    fixture(&pool).await;
    let debt = a_debt(&pool, &store(), "payable", "Budi", "25000").await;
    let turns = store();

    // A transaction challenge under the same id says nothing about the debt.
    turns.challenge(SESSION, &debt, TURN, crate::owe1::session::now_secs());
    let error = run(
        &pool,
        &turns,
        "delete_debt",
        json!({ "debt_id": debt, "confirmed": true }),
    )
    .await
    .unwrap_err();
    let oewang_domain::AppError::ConfirmationRequired(target) = error else {
        panic!("expected a challenge, got {}", error.code())
    };
    assert_eq!(target["contact"], "Budi");
    assert!(target["remaining"].contains("25"));

    answer(
        &pool,
        &turns,
        "delete_debt",
        json!({ "debt_id": debt, "confirmed": true }),
    )
    .await
    .unwrap();
    let gone = crate::debts::service::find(&pool, WORKSPACE, &debt).await;
    assert_eq!(gone.unwrap_err().code(), "DEBT_NOT_FOUND");
}

/// D122: the first split call writes nothing and shows the API's split; the
/// same split confirmed writes it; a changed split is asked again.
#[sqlx::test(migrations = "../../migrations")]
async fn should_show_a_split_before_writing_it(pool: PgPool) {
    fixture(&pool).await;
    a_debt(&pool, &store(), "receivable", "Ani", "1").await;
    let turns = store();
    let split = json!({
        "amount": "100000",
        "name": "Dinner",
        "category_id": "cat_food",
        "contact_names": ["ani", "Budi"]
    });

    let error = run(&pool, &turns, "split_bill", split.clone())
        .await
        .unwrap_err();
    let oewang_domain::AppError::ConfirmationRequired(target) = error else {
        panic!("expected a challenge, got {}", error.code())
    };
    assert_eq!(target["people"], "Ani, Budi (new contact)");
    assert!(
        target["share_each"].contains("33"),
        "{}",
        target["share_each"]
    );
    assert!(target["yours"].contains("33"), "{}", target["yours"]);
    assert_ne!(
        target["share_each"], target["yours"],
        "the person keeps the remainder"
    );
    assert_eq!(
        count(&pool, "SELECT count(*) FROM debts").await,
        1,
        "nothing written on the first call"
    );
    assert_eq!(count(&pool, "SELECT count(*) FROM contacts").await, 1);

    // A different split is not the one the person saw.
    let mut changed = split.clone();
    changed["amount"] = json!("90000");
    changed["confirmed"] = json!(true);
    let error = run(&pool, &turns, "split_bill", changed).await.unwrap_err();
    assert_eq!(error.code(), "CONFIRMATION_REQUIRED");

    let mut confirmed = split.clone();
    confirmed["confirmed"] = json!(true);
    let outcome = answer(&pool, &turns, "split_bill", confirmed.clone())
        .await
        .unwrap();
    let receivables = outcome.result["receivables"].as_array().unwrap();
    assert_eq!(receivables.len(), 2);
    for receivable in receivables {
        assert_eq!(receivable["amount"], "33333.0000");
        assert_eq!(receivable["type"], "receivable");
    }

    // One confirmation answers one split: the same call again is asked again.
    let error = run(&pool, &turns, "split_bill", confirmed)
        .await
        .unwrap_err();
    assert_eq!(error.code(), "CONFIRMATION_REQUIRED");
}

// ------------------------------------------------------------------ TXN-28

/// "500k at the supermarket, 40k of it cigarettes" is one transaction with
/// one categorised item, and the read tools answer from its shares (D123).
#[sqlx::test(migrations = "../../migrations")]
async fn should_create_a_transaction_with_categorised_items_and_report_its_shares(pool: PgPool) {
    fixture(&pool).await;
    sqlx::query(
        "INSERT INTO categories (id, workspace_id, name, type)
         VALUES ('cat_smoke', $1, 'Cigarettes', 'expense')",
    )
    .bind(WORKSPACE)
    .execute(&pool)
    .await
    .unwrap();
    for (id, category) in [("bud_food", "cat_food"), ("bud_smoke", "cat_smoke")] {
        sqlx::query(
            "INSERT INTO budgets (id, workspace_id, category_id, amount)
             VALUES ($1, $2, $3, 1000000)",
        )
        .bind(id)
        .bind(WORKSPACE)
        .bind(category)
        .execute(&pool)
        .await
        .unwrap();
    }
    let turns = store();

    let created = run(
        &pool,
        &turns,
        "create_transaction",
        json!({
            "type": "expense",
            "amount": "500000",
            "wallet_id": "wal_cash",
            "category_id": "cat_food",
            "date": "2026-11-10",
            "name": "Superindo",
            "items": [{ "name": "Rokok", "amount": "40000", "category_id": "cat_smoke" }]
        }),
    )
    .await
    .unwrap();
    let id = created.result["id"].as_str().unwrap().to_string();

    // One row, one wallet movement, one item with its own category and the
    // amount exactly as it was sent.
    let items: Vec<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT name, amount::text, category_id FROM transaction_items WHERE transaction_id = $1",
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        items,
        [(
            "Rokok".to_string(),
            "40000.0000".to_string(),
            Some("cat_smoke".to_string())
        )]
    );
    let balance: Decimal = sqlx::query_scalar("SELECT balance FROM wallets WHERE id = 'wal_cash'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        balance,
        Decimal::ZERO,
        "the items moved no money of their own"
    );

    let summary = run(
        &pool,
        &turns,
        "get_spending_summary",
        json!({ "from": "2026-11-01", "to": "2026-11-30", "group_by": "category" }),
    )
    .await
    .unwrap();
    let group = |label: &str| {
        summary.result["groups"]
            .as_array()
            .unwrap()
            .iter()
            .find(|group| group["label"] == label)
            .unwrap_or_else(|| panic!("no {label} group"))
            .clone()
    };
    assert_eq!(summary.result["spent_formatted"], "Rp 500.000");
    assert_eq!(group("Food")["total_formatted"], "Rp 460.000");
    assert_eq!(group("Cigarettes")["total_formatted"], "Rp 40.000");

    let status = run(
        &pool,
        &turns,
        "get_budget_status",
        json!({ "month": "2026-11" }),
    )
    .await
    .unwrap();
    let budget = |category: &str| {
        status.result["budgets"]
            .as_array()
            .unwrap()
            .iter()
            .find(|line| line["category_id"] == category)
            .unwrap_or_else(|| panic!("no {category} budget"))
            .clone()
    };
    assert_eq!(budget("cat_food")["spent_formatted"], "Rp 460.000");
    assert_eq!(budget("cat_smoke")["spent_formatted"], "Rp 40.000");
}

/// An item's category is checked like the transaction's own: one from
/// another workspace, or one that does not exist, writes nothing.
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_an_item_category_the_workspace_does_not_have(pool: PgPool) {
    fixture(&pool).await;

    let error = run(
        &pool,
        &store(),
        "create_transaction",
        json!({
            "type": "expense", "amount": "500000", "wallet_id": "wal_cash",
            "items": [{ "name": "Rokok", "amount": "40000", "category_id": "cat_elsewhere" }]
        }),
    )
    .await
    .unwrap_err();

    assert_eq!(error.code(), "CATEGORY_NOT_FOUND");
    let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM transactions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(rows, 0);
}
