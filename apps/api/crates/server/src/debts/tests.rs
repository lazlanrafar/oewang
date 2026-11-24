//! Debts, payments and contacts against a real database. What only a
//! database can answer is tested here: that a payment, its transaction, the
//! balance and the remaining amount commit together or not at all, and that
//! every way of deleting a transaction keeps its payment honest (D121).

use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use oewang_domain::{ledger::TransactionType, AppError};
use rust_decimal::Decimal;
use sqlx::PgPool;

use crate::{
    audit::Actor,
    contacts::service::{self as contacts, ContactInput},
    debts::service::{self, BulkItem, DebtChange, DebtInput, NewExpense, PayInput, SplitSource},
    transactions::service::{self as ledger, TransactionInput},
};

const WORKSPACE: &str = "ws_debt";
const USER: &str = "usr_debt";
const CASH: &str = "w_cash";
const BANK: &str = "w_bank";
const USD: &str = "w_usd";

fn actor() -> Actor<'static> {
    Actor::web(WORKSPACE, USER)
}

fn d(value: &str) -> Decimal {
    value.parse().unwrap()
}

fn day(day: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 11, day, 9, 0, 0).unwrap()
}

async fn fixture(pool: &PgPool) {
    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'd@example.com', 'x')")
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
    sqlx::query(
        "INSERT INTO user_workspaces (id, workspace_id, user_id, role)
         VALUES ('m_debt', $1, $2, 'owner')",
    )
    .bind(WORKSPACE)
    .bind(USER)
    .execute(pool)
    .await
    .unwrap();
    for (id, currency) in [(CASH, "IDR"), (BANK, "IDR"), (USD, "USD")] {
        sqlx::query(
            "INSERT INTO wallets (id, workspace_id, name, currency_code) VALUES ($1, $2, $1, $3)",
        )
        .bind(id)
        .bind(WORKSPACE)
        .bind(currency)
        .execute(pool)
        .await
        .unwrap();
    }
}

async fn contact(pool: &PgPool, name: &str) -> String {
    let input = ContactInput {
        name,
        email: None,
        phone: None,
        note: None,
    };
    contacts::create_with_id(pool, actor(), None, input)
        .await
        .unwrap()
        .0
        .id
}

async fn debt(pool: &PgPool, contact_id: &str, kind: &str, amount: &str) -> String {
    debt_in(pool, contact_id, kind, amount, None).await
}

async fn debt_in(
    pool: &PgPool,
    contact_id: &str,
    kind: &str,
    amount: &str,
    currency: Option<&str>,
) -> String {
    let input = DebtInput {
        kind,
        contact_id,
        amount: d(amount),
        currency_code: currency,
        due_date: None,
        description: Some("Dinner"),
        source_transaction_id: None,
    };
    service::create_with_id(pool, actor(), None, input)
        .await
        .unwrap()
        .0
        .id
}

fn pay_input(amount: &str, wallet: Option<&'static str>) -> PayInput<'static> {
    PayInput {
        amount: d(amount),
        wallet_id: wallet,
        date: day(20),
        exchange_rate: None,
    }
}

async fn balance(pool: &PgPool, wallet_id: &str) -> Decimal {
    sqlx::query_scalar("SELECT balance FROM wallets WHERE id = $1")
        .bind(wallet_id)
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn remaining(pool: &PgPool, debt_id: &str) -> (Decimal, String) {
    let row = service::find(pool, WORKSPACE, debt_id).await.unwrap();
    (row.remaining_amount, row.status)
}

async fn live_payments(pool: &PgPool, debt_id: &str) -> i64 {
    sqlx::query_scalar(
        "SELECT count(*) FROM debt_payments WHERE debt_id = $1 AND deleted_at IS NULL",
    )
    .bind(debt_id)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn audit_actions(pool: &PgPool, entity_id: &str) -> Vec<String> {
    sqlx::query_scalar(
        "SELECT action FROM audit_logs WHERE workspace_id = $1 AND entity_id = $2
         ORDER BY created_at, id",
    )
    .bind(WORKSPACE)
    .bind(entity_id)
    .fetch_all(pool)
    .await
    .unwrap()
}

fn expense<'a>(wallet_id: &'a str, amount: &str) -> TransactionInput<'a> {
    TransactionInput {
        kind: TransactionType::Expense,
        wallet_id,
        to_wallet_id: None,
        category_id: None,
        amount: d(amount),
        to_amount: None,
        original_amount: None,
        original_currency_code: None,
        exchange_rate: None,
        requested_base_rate: None,
        date: day(10),
        name: Some("Dinner"),
        description: None,
        attachment_ids: None,
    }
}

// ---------------------------------------------------------------- contacts

/// CON-1
#[sqlx::test(migrations = "../../migrations")]
async fn should_create_a_contact_once_for_a_repeated_client_id(pool: PgPool) {
    fixture(&pool).await;
    let id = cuid2::create_id();
    let input = || ContactInput {
        name: "  Budi  ",
        email: Some("budi@example.com"),
        phone: None,
        note: None,
    };

    let (first, made) = contacts::create_with_id(&pool, actor(), Some(&id), input())
        .await
        .unwrap();
    let (second, again) = contacts::create_with_id(&pool, actor(), Some(&id), input())
        .await
        .unwrap();

    assert!(made && !again);
    assert_eq!(first.id, second.id);
    assert_eq!(first.name, "Budi", "the name is stored trimmed");
    assert_eq!(audit_actions(&pool, &id).await, ["contact.created"]);
}

/// CON-3
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_to_delete_a_contact_with_a_live_debt_paid_or_not(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let owed = debt(&pool, &budi, "receivable", "100").await;
    service::pay(&pool, actor(), &owed, None, pay_input("100", None))
        .await
        .unwrap();

    let refused = contacts::delete(&pool, actor(), &budi).await.unwrap_err();
    assert!(
        matches!(refused, AppError::ContactHasDebts),
        "a paid debt still holds it"
    );

    let payment_id: String = sqlx::query_scalar("SELECT id FROM debt_payments WHERE debt_id = $1")
        .bind(&owed)
        .fetch_one(&pool)
        .await
        .unwrap();
    service::cancel_payment(&pool, actor(), &owed, &payment_id)
        .await
        .unwrap();
    service::delete(&pool, actor(), &owed).await.unwrap();
    contacts::delete(&pool, actor(), &budi).await.unwrap();
}

/// CON-4
#[sqlx::test(migrations = "../../migrations")]
async fn should_merge_a_contact_by_moving_its_debts_and_deleting_it(pool: PgPool) {
    fixture(&pool).await;
    let typo = contact(&pool, "Budi S").await;
    let budi = contact(&pool, "Budi").await;
    let first = debt(&pool, &typo, "receivable", "100").await;
    let second = debt(&pool, &typo, "payable", "50").await;

    let self_merge = contacts::merge(&pool, actor(), &budi, &budi)
        .await
        .unwrap_err();
    assert!(matches!(self_merge, AppError::ContactMergeSelf));

    let kept = contacts::merge(&pool, actor(), &typo, &budi).await.unwrap();
    assert_eq!(kept.id, budi);
    for id in [&first, &second] {
        assert_eq!(
            service::find(&pool, WORKSPACE, id)
                .await
                .unwrap()
                .contact_id,
            budi
        );
        assert_eq!(
            audit_actions(&pool, id).await,
            ["debt.created", "debt.updated"]
        );
    }
    assert!(matches!(
        contacts::find(&pool, WORKSPACE, &typo).await.unwrap_err(),
        AppError::ContactNotFound
    ));
    assert_eq!(
        audit_actions(&pool, &typo).await,
        ["contact.created", "contact.merged"]
    );
}

// ------------------------------------------------------------------- debts

/// DEBT-1
#[sqlx::test(migrations = "../../migrations")]
async fn should_create_a_debt_in_the_workspace_currency_unpaid(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt(&pool, &budi, "payable", "250000").await;

    let row = service::find(&pool, WORKSPACE, &id).await.unwrap();
    assert_eq!(row.currency_code, "IDR");
    assert_eq!(row.remaining_amount, d("250000"));
    assert_eq!(row.status, "unpaid");
    assert_eq!(row.origin, "manual");
    assert_eq!(audit_actions(&pool, &id).await, ["debt.created"]);

    let unknown = service::create_with_id(
        &pool,
        actor(),
        None,
        DebtInput {
            kind: "owed",
            contact_id: &budi,
            amount: d("1"),
            currency_code: None,
            due_date: None,
            description: None,
            source_transaction_id: None,
        },
    )
    .await
    .unwrap_err();
    assert!(matches!(unknown, AppError::Validation(_)));
}

/// DEBT-2
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_an_amount_below_what_is_paid_and_keep_the_status_true(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt(&pool, &budi, "receivable", "100").await;
    service::pay(&pool, actor(), &id, None, pay_input("80", None))
        .await
        .unwrap();

    let below = DebtChange {
        amount: Some(d("50")),
        ..Default::default()
    };
    let refused = service::update(&pool, actor(), &id, below, None)
        .await
        .unwrap_err();
    assert!(matches!(refused, AppError::AmountBelowPaid));

    let exact = DebtChange {
        amount: Some(d("80")),
        ..Default::default()
    };
    let paid = service::update(&pool, actor(), &id, exact, None)
        .await
        .unwrap();
    assert_eq!(
        (paid.remaining_amount, paid.status.as_str()),
        (d("0"), "paid")
    );

    let more = DebtChange {
        amount: Some(d("120")),
        due_date: Some(Some(NaiveDate::from_ymd_opt(2026, 12, 1).unwrap())),
        ..Default::default()
    };
    let partial = service::update(&pool, actor(), &id, more, None)
        .await
        .unwrap();
    assert_eq!(
        (partial.remaining_amount, partial.status.as_str()),
        (d("40"), "partial")
    );
}

/// DEBT-2
#[sqlx::test(migrations = "../../migrations")]
async fn should_fix_type_and_currency_once_a_payment_exists(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt(&pool, &budi, "receivable", "100").await;

    let before_payment = DebtChange {
        kind: Some("payable"),
        currency_code: Some("usd"),
        ..Default::default()
    };
    let changed = service::update(&pool, actor(), &id, before_payment, None)
        .await
        .unwrap();
    assert_eq!(
        (changed.r#type.as_str(), changed.currency_code.as_str()),
        ("payable", "USD")
    );

    service::pay(&pool, actor(), &id, None, pay_input("10", None))
        .await
        .unwrap();
    for change in [
        DebtChange {
            kind: Some("receivable"),
            ..Default::default()
        },
        DebtChange {
            currency_code: Some("IDR"),
            ..Default::default()
        },
    ] {
        let refused = service::update(&pool, actor(), &id, change, None)
            .await
            .unwrap_err();
        assert!(matches!(refused, AppError::DebtHasPayments));
    }
}

/// DEBT-2: `If-Match` (D115).
#[sqlx::test(migrations = "../../migrations")]
async fn should_answer_stale_for_an_edit_based_on_an_old_version(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt(&pool, &budi, "receivable", "100").await;
    let seen = service::find(&pool, WORKSPACE, &id)
        .await
        .unwrap()
        .updated_at;
    service::pay(&pool, actor(), &id, None, pay_input("10", None))
        .await
        .unwrap();

    let change = DebtChange {
        description: Some(Some("Lunch")),
        ..Default::default()
    };
    let stale = service::update(&pool, actor(), &id, change, Some(seen))
        .await
        .unwrap_err();
    assert!(matches!(stale, AppError::Stale(_)));
}

/// DEBT-3
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_to_delete_a_debt_with_a_live_payment(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt(&pool, &budi, "payable", "100").await;
    service::pay(&pool, actor(), &id, None, pay_input("10", Some(CASH)))
        .await
        .unwrap();

    let refused = service::delete(&pool, actor(), &id).await.unwrap_err();
    assert!(matches!(refused, AppError::DebtHasPayments));
}

// ---------------------------------------------------------------- payments

/// DEBT-4
#[sqlx::test(migrations = "../../migrations")]
async fn should_write_an_expense_for_a_payable_and_lower_what_is_left(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt(&pool, &budi, "payable", "100000").await;

    let (paid, made) = service::pay(&pool, actor(), &id, None, pay_input("40000", Some(CASH)))
        .await
        .unwrap();

    assert!(made);
    let transaction = paid
        .transaction
        .expect("a wallet payment writes a transaction");
    assert_eq!(transaction.r#type, "expense");
    assert_eq!(transaction.amount, d("40000"));
    assert_eq!(transaction.category_id, None);
    assert_eq!(transaction.name.as_deref(), Some("Budi"));
    assert_eq!(transaction.date, day(20));
    assert_eq!(balance(&pool, CASH).await, d("-40000"));
    assert_eq!(remaining(&pool, &id).await, (d("60000"), "partial".into()));
    assert_eq!(audit_actions(&pool, &paid.payment.id).await, ["debt.paid"]);

    let over = service::pay(&pool, actor(), &id, None, pay_input("60001", None))
        .await
        .unwrap_err();
    assert!(matches!(over, AppError::PaymentExceedsRemaining));

    let (outside, _) = service::pay(&pool, actor(), &id, None, pay_input("60000", None))
        .await
        .unwrap();
    assert!(outside.transaction.is_none(), "no wallet, no transaction");
    assert_eq!(remaining(&pool, &id).await, (d("0"), "paid".into()));
}

/// DEBT-4: a receivable paid back is income.
#[sqlx::test(migrations = "../../migrations")]
async fn should_write_income_for_a_receivable(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt(&pool, &budi, "receivable", "50").await;
    let (paid, _) = service::pay(&pool, actor(), &id, None, pay_input("50", Some(CASH)))
        .await
        .unwrap();
    assert_eq!(paid.transaction.unwrap().r#type, "income");
    assert_eq!(balance(&pool, CASH).await, d("50"));
}

/// DEBT-4: two payments at once cannot together exceed the debt.
#[sqlx::test(migrations = "../../migrations")]
async fn should_never_let_concurrent_payments_exceed_the_remaining_amount(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt(&pool, &budi, "payable", "100").await;

    let one = {
        let (pool, id) = (pool.clone(), id.clone());
        tokio::spawn(async move {
            service::pay(&pool, actor(), &id, None, pay_input("60", Some(CASH))).await
        })
    };
    let two = {
        let (pool, id) = (pool.clone(), id.clone());
        tokio::spawn(async move {
            service::pay(&pool, actor(), &id, None, pay_input("60", Some(BANK))).await
        })
    };
    let results = [one.await.unwrap(), two.await.unwrap()];

    assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
    assert!(results
        .iter()
        .any(|r| matches!(r, Err(AppError::PaymentExceedsRemaining))));
    assert_eq!(remaining(&pool, &id).await, (d("40"), "partial".into()));
    assert_eq!(
        balance(&pool, CASH).await + balance(&pool, BANK).await,
        d("-60"),
        "the refused payment's transaction rolled back with it"
    );
}

/// DEBT-4, D114: a replayed payment pays once.
#[sqlx::test(migrations = "../../migrations")]
async fn should_pay_once_for_a_repeated_client_id(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt(&pool, &budi, "payable", "100").await;
    let payment_id = cuid2::create_id();

    let (first, made) = service::pay(
        &pool,
        actor(),
        &id,
        Some(&payment_id),
        pay_input("30", Some(CASH)),
    )
    .await
    .unwrap();
    let (again, repeat) = service::pay(
        &pool,
        actor(),
        &id,
        Some(&payment_id),
        pay_input("30", Some(CASH)),
    )
    .await
    .unwrap();

    assert!(made && !repeat);
    assert_eq!(first.payment.id, again.payment.id);
    assert_eq!(live_payments(&pool, &id).await, 1);
    assert_eq!(balance(&pool, CASH).await, d("-30"));
    assert_eq!(remaining(&pool, &id).await.0, d("70"));
}

/// DEBT-5
#[sqlx::test(migrations = "../../migrations")]
async fn should_enter_a_payment_in_another_currency_as_a_foreign_entry(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt_in(&pool, &budi, "payable", "100", Some("USD")).await;

    let input = PayInput {
        amount: d("40"),
        wallet_id: Some(CASH),
        date: day(20),
        exchange_rate: Some(d("16000")),
    };
    let (paid, _) = service::pay(&pool, actor(), &id, None, input)
        .await
        .unwrap();

    let transaction = paid.transaction.unwrap();
    assert_eq!(
        transaction.amount,
        d("640000"),
        "what left the rupiah wallet"
    );
    assert_eq!(transaction.original_amount, Some(d("40")));
    assert_eq!(transaction.original_currency_code.as_deref(), Some("USD"));
    assert_eq!(transaction.exchange_rate, Some(d("16000")));
    assert_eq!(balance(&pool, CASH).await, d("-640000"));
    assert_eq!(
        remaining(&pool, &id).await.0,
        d("60"),
        "in dollars, the debt's currency"
    );
}

/// DEBT-6
#[sqlx::test(migrations = "../../migrations")]
async fn should_pay_in_bulk_one_transaction_per_debt_or_not_at_all(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let ani = contact(&pool, "Ani").await;
    let first = debt(&pool, &budi, "payable", "100").await;
    let second = debt(&pool, &ani, "payable", "50").await;

    let too_much = [
        BulkItem {
            id: None,
            debt_id: &first,
            amount: d("100"),
        },
        BulkItem {
            id: None,
            debt_id: &second,
            amount: d("51"),
        },
    ];
    let refused = service::bulk_pay(&pool, actor(), Some(CASH), day(20), &too_much)
        .await
        .unwrap_err();
    assert!(matches!(refused, AppError::PaymentExceedsRemaining));
    assert_eq!(balance(&pool, CASH).await, d("0"), "nothing was written");
    assert_eq!(live_payments(&pool, &first).await, 0);

    let dollars = debt_in(&pool, &budi, "payable", "5", Some("USD")).await;
    let mixed = [BulkItem {
        id: None,
        debt_id: &dollars,
        amount: d("5"),
    }];
    let mismatch = service::bulk_pay(&pool, actor(), Some(CASH), day(20), &mixed)
        .await
        .unwrap_err();
    assert!(matches!(mismatch, AppError::BulkPayCurrencyMismatch));

    let both = [
        BulkItem {
            id: None,
            debt_id: &first,
            amount: d("100"),
        },
        BulkItem {
            id: None,
            debt_id: &second,
            amount: d("50"),
        },
    ];
    let (paid, made) = service::bulk_pay(&pool, actor(), Some(CASH), day(20), &both)
        .await
        .unwrap();
    assert!(made);
    let transactions: Vec<_> = paid
        .iter()
        .map(|p| p.transaction.as_ref().unwrap().id.clone())
        .collect();
    assert_eq!(transactions.len(), 2);
    assert_ne!(
        transactions[0], transactions[1],
        "one transaction per debt (D121)"
    );
    assert_eq!(balance(&pool, CASH).await, d("-150"));
    assert_eq!(remaining(&pool, &second).await.1, "paid");
}

/// DEBT-7
#[sqlx::test(migrations = "../../migrations")]
async fn should_cancel_a_payment_and_its_transaction_together(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt(&pool, &budi, "payable", "100").await;
    let (paid, _) = service::pay(&pool, actor(), &id, None, pay_input("100", Some(CASH)))
        .await
        .unwrap();
    let transaction_id = paid.transaction.unwrap().id;

    service::cancel_payment(&pool, actor(), &id, &paid.payment.id)
        .await
        .unwrap();

    assert_eq!(remaining(&pool, &id).await, (d("100"), "unpaid".into()));
    assert_eq!(balance(&pool, CASH).await, d("0"));
    assert!(matches!(
        ledger::find(&pool, WORKSPACE, &transaction_id)
            .await
            .unwrap_err(),
        AppError::TransactionNotFound
    ));
    assert_eq!(
        audit_actions(&pool, &paid.payment.id).await,
        ["debt.paid", "debt.payment_cancelled"]
    );
    let wrong_debt = service::cancel_payment(&pool, actor(), "nope", &paid.payment.id)
        .await
        .unwrap_err();
    assert!(matches!(wrong_debt, AppError::PaymentNotFound));
}

// ----------------------------------------------- the transaction side, D121

/// DEBT-8: the single delete route, which the chat and MCP delete tools
/// also run.
#[sqlx::test(migrations = "../../migrations")]
async fn should_cancel_the_payment_when_its_transaction_is_deleted(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt(&pool, &budi, "payable", "100").await;
    let (paid, _) = service::pay(&pool, actor(), &id, None, pay_input("70", Some(CASH)))
        .await
        .unwrap();

    ledger::delete(&pool, actor(), &paid.transaction.unwrap().id)
        .await
        .unwrap();

    assert_eq!(live_payments(&pool, &id).await, 0);
    assert_eq!(remaining(&pool, &id).await, (d("100"), "unpaid".into()));
    assert_eq!(balance(&pool, CASH).await, d("0"));
}

/// DEBT-8: the bulk delete route.
#[sqlx::test(migrations = "../../migrations")]
async fn should_cancel_every_payment_in_a_bulk_delete(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let first = debt(&pool, &budi, "payable", "100").await;
    let second = debt(&pool, &budi, "receivable", "40").await;
    let (a, _) = service::pay(&pool, actor(), &first, None, pay_input("100", Some(CASH)))
        .await
        .unwrap();
    let (b, _) = service::pay(&pool, actor(), &second, None, pay_input("40", Some(CASH)))
        .await
        .unwrap();
    let unrelated = ledger::create(&pool, actor(), expense(CASH, "5"))
        .await
        .unwrap();

    let ids = vec![
        a.transaction.unwrap().id,
        b.transaction.unwrap().id,
        unrelated.id,
    ];
    ledger::bulk_delete(&pool, actor(), &ids).await.unwrap();

    assert_eq!(remaining(&pool, &first).await, (d("100"), "unpaid".into()));
    assert_eq!(remaining(&pool, &second).await, (d("40"), "unpaid".into()));
    assert_eq!(balance(&pool, CASH).await, d("0"));
}

/// DEBT-8
#[sqlx::test(migrations = "../../migrations")]
async fn should_lock_a_payment_transaction_money_but_not_its_label(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt(&pool, &budi, "payable", "100").await;
    let (paid, _) = service::pay(&pool, actor(), &id, None, pay_input("100", Some(CASH)))
        .await
        .unwrap();
    let transaction = paid.transaction.unwrap();

    let base = || TransactionInput {
        kind: TransactionType::Expense,
        wallet_id: CASH,
        to_wallet_id: None,
        category_id: None,
        amount: d("100"),
        to_amount: None,
        original_amount: None,
        original_currency_code: None,
        exchange_rate: None,
        requested_base_rate: None,
        date: day(21),
        name: Some("Paid Budi back"),
        description: None,
        attachment_ids: None,
    };

    let renamed = ledger::update(&pool, actor(), &transaction.id, base(), None)
        .await
        .unwrap();
    assert_eq!(renamed.name.as_deref(), Some("Paid Budi back"));
    // Items move no money (TXN-12), so they stay editable.
    let item = ledger::ItemInput {
        name: "Nasi goreng",
        brand: None,
        quantity: None,
        unit: None,
        unit_price: None,
        amount: d("35"),
        category_id: None,
        notes: None,
    };
    ledger::add_item(&pool, actor(), &transaction.id, item)
        .await
        .unwrap();

    for change in [
        TransactionInput {
            amount: d("90"),
            ..base()
        },
        TransactionInput {
            wallet_id: BANK,
            ..base()
        },
        TransactionInput {
            kind: TransactionType::Income,
            ..base()
        },
    ] {
        let refused = ledger::update(&pool, actor(), &transaction.id, change, None)
            .await
            .unwrap_err();
        assert!(matches!(refused, AppError::PaymentTransactionLocked));
    }
    assert_eq!(balance(&pool, CASH).await, d("-100"));
}

/// DEBT-9
#[sqlx::test(migrations = "../../migrations")]
async fn should_keep_a_debt_when_its_source_transaction_is_deleted(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let source = ledger::create(
        &pool,
        actor(),
        TransactionInput {
            requested_base_rate: Some(d("16000")),
            ..expense(USD, "30")
        },
    )
    .await
    .unwrap();

    let (debt, _) = service::create_with_id(
        &pool,
        actor(),
        None,
        DebtInput {
            kind: "receivable",
            contact_id: &budi,
            amount: d("15"),
            currency_code: None,
            due_date: None,
            description: None,
            source_transaction_id: Some(&source.id),
        },
    )
    .await
    .unwrap();
    assert_eq!(debt.origin, "from_transaction");
    assert_eq!(debt.currency_code, "USD", "the source wallet's currency");

    let (sourced, _) = service::for_transaction(&pool, WORKSPACE, &source.id)
        .await
        .unwrap();
    assert_eq!(sourced.len(), 1);

    ledger::delete(&pool, actor(), &source.id).await.unwrap();

    let after = service::find(&pool, WORKSPACE, &debt.id).await.unwrap();
    assert_eq!(after.source_transaction_id, None);
    assert_eq!(after.origin, "from_transaction");
    assert_eq!(after.remaining_amount, d("15"));
}

// ------------------------------------------------------------------- split

/// DEBT-10
#[sqlx::test(migrations = "../../migrations")]
async fn should_split_equally_and_leave_the_remainder_with_the_person(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;

    let names = vec!["budi ".to_string(), "Ani".to_string(), "ANI".to_string()];
    let source = SplitSource::New(NewExpense {
        wallet_id: CASH,
        amount: d("100000"),
        name: "Dinner",
        category_id: None,
        date: day(12),
    });
    let (transaction, debts) = service::split(&pool, actor(), source, &[], &names)
        .await
        .unwrap();

    assert_eq!(transaction.amount, d("100000"));
    assert_eq!(balance(&pool, CASH).await, d("-100000"));
    assert_eq!(debts.len(), 2, "duplicates dropped, case-insensitively");
    for row in &debts {
        assert_eq!(row.amount, d("33333"), "floored to whole rupiah");
        assert_eq!(row.r#type, "receivable");
        assert_eq!(row.origin, "from_transaction");
        assert_eq!(
            row.source_transaction_id.as_deref(),
            Some(transaction.id.as_str())
        );
    }
    assert!(
        debts.iter().any(|row| row.contact_id == budi),
        "an existing contact is matched"
    );
    let contacts: i64 = sqlx::query_scalar("SELECT count(*) FROM contacts WHERE workspace_id = $1")
        .bind(WORKSPACE)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(contacts, 2, "only Ani was new");
}

/// DEBT-10
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_to_split_anything_but_an_expense(pool: PgPool) {
    fixture(&pool).await;
    let income = ledger::create(
        &pool,
        actor(),
        TransactionInput {
            kind: TransactionType::Income,
            ..expense(CASH, "100")
        },
    )
    .await
    .unwrap();

    let names = vec!["Ani".to_string()];
    let refused = service::split(
        &pool,
        actor(),
        SplitSource::Existing(&income.id),
        &[],
        &names,
    )
    .await
    .unwrap_err();
    assert!(matches!(refused, AppError::SplitSourceNotExpense));

    let none = service::split(&pool, actor(), SplitSource::Existing(&income.id), &[], &[])
        .await
        .unwrap_err();
    assert!(matches!(none, AppError::Validation(_)));

    let crowd: Vec<String> = (0..21).map(|n| format!("Friend {n}")).collect();
    let too_many = service::split(
        &pool,
        actor(),
        SplitSource::Existing(&income.id),
        &[],
        &crowd,
    )
    .await
    .unwrap_err();
    assert!(
        matches!(too_many, AppError::Validation(_)),
        "21 people is past the cap"
    );
}

// ------------------------------------------------------------ figures, role

/// The figures behind the debts page's cards and the overview's Debt
/// balance card, whatever the list's filters (the screens are US-071).
#[sqlx::test(migrations = "../../migrations")]
async fn should_sum_open_debts_and_count_the_overdue_ones(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    debt(&pool, &budi, "receivable", "300").await;
    let late = debt(&pool, &budi, "payable", "100").await;
    let paid = debt(&pool, &budi, "receivable", "999").await;
    service::pay(&pool, actor(), &paid, None, pay_input("999", None))
        .await
        .unwrap();
    let due = DebtChange {
        due_date: Some(Some(NaiveDate::from_ymd_opt(2026, 11, 1).unwrap())),
        ..Default::default()
    };
    service::update(&pool, actor(), &late, due, None)
        .await
        .unwrap();

    let today = NaiveDate::from_ymd_opt(2026, 11, 24).unwrap();
    let summary = service::summary(&pool, WORKSPACE, today).await.unwrap();

    assert_eq!(summary.owed_to_you, d("300"));
    assert_eq!(summary.you_owe, d("100"));
    assert_eq!(summary.net, d("200"));
    assert_eq!(summary.open_count, 2);
    assert_eq!(summary.overdue_count, 1);
    assert_eq!(summary.left_out, 0);
}

/// DEBT-1, CON-1: every write route sits behind `AuthWrite`, which re-reads
/// the membership row; a member is refused there. There is no HTTP harness
/// in this crate, so this is that read answering.
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_debt_and_contact_writes_to_a_member(pool: PgPool) {
    fixture(&pool).await;
    sqlx::query(
        "INSERT INTO users (id, email, password_hash) VALUES ('usr_reader', 'r@example.com', 'x')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO user_workspaces (id, workspace_id, user_id, role)
         VALUES ('m_reader', $1, 'usr_reader', 'member')",
    )
    .bind(WORKSPACE)
    .execute(&pool)
    .await
    .unwrap();

    let role = crate::auth::service::current_role(&pool, WORKSPACE, "usr_reader")
        .await
        .unwrap();
    assert!(!role.can_write());
}

/// DEBT-7: two cancels of one payment at once give the money back once.
#[sqlx::test(migrations = "../../migrations")]
async fn should_restore_the_remaining_amount_once_for_concurrent_cancels(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt(&pool, &budi, "payable", "100").await;
    service::pay(&pool, actor(), &id, None, pay_input("30", None))
        .await
        .unwrap();
    let (paid, _) = service::pay(&pool, actor(), &id, None, pay_input("30", None))
        .await
        .unwrap();

    // Hold the debt row so both cancels read the payment as live before
    // either can lock, which is the interleaving a double click produces.
    let gate = hold(&pool, "SELECT id FROM debts WHERE id = $1 FOR UPDATE", &id).await;
    let cancel = || {
        let (pool, id, payment) = (pool.clone(), id.clone(), paid.payment.id.clone());
        tokio::spawn(async move { service::cancel_payment(&pool, actor(), &id, &payment).await })
    };
    let (one, two) = (cancel(), cancel());
    release(gate).await;
    let results = [one.await.unwrap(), two.await.unwrap()];

    assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
    assert_eq!(remaining(&pool, &id).await, (d("70"), "partial".into()));
}

/// DEBT-8, TXN-5: two deletes of one payment transaction at once reverse
/// the balance and cancel the payment once.
#[sqlx::test(migrations = "../../migrations")]
async fn should_reverse_once_for_concurrent_deletes_of_a_payment_transaction(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt(&pool, &budi, "payable", "100").await;
    let (paid, _) = service::pay(&pool, actor(), &id, None, pay_input("40", Some(CASH)))
        .await
        .unwrap();
    let transaction = paid.transaction.unwrap().id;

    // Hold the wallet so both deletes read the row as live before either
    // can lock it.
    let gate = hold(
        &pool,
        "SELECT id FROM wallets WHERE id = $1 FOR UPDATE",
        CASH,
    )
    .await;
    let delete = || {
        let (pool, transaction) = (pool.clone(), transaction.clone());
        tokio::spawn(async move { ledger::delete(&pool, actor(), &transaction).await })
    };
    let (one, two) = (delete(), delete());
    release(gate).await;
    let results = [one.await.unwrap(), two.await.unwrap()];

    assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
    assert_eq!(balance(&pool, CASH).await, d("0"));
    assert_eq!(remaining(&pool, &id).await, (d("100"), "unpaid".into()));
}

/// Lock one row in a transaction of its own, so concurrent callers queue
/// behind it after doing their unlocked reads.
async fn hold(
    pool: &PgPool,
    sql: &'static str,
    id: &str,
) -> sqlx::Transaction<'static, sqlx::Postgres> {
    let mut gate = pool.begin().await.unwrap();
    sqlx::query(sql).bind(id).execute(&mut *gate).await.unwrap();
    gate
}

async fn release(gate: sqlx::Transaction<'static, sqlx::Postgres>) {
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    gate.commit().await.unwrap();
}

/// DEBT-8: moving a foreign-entry payment to a wallet in the entry's own
/// currency is refused for being a payment, not as an invalid foreign entry.
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_moving_a_foreign_payment_as_locked(pool: PgPool) {
    fixture(&pool).await;
    let budi = contact(&pool, "Budi").await;
    let id = debt_in(&pool, &budi, "payable", "100", Some("USD")).await;
    let input = PayInput {
        amount: d("40"),
        wallet_id: Some(CASH),
        date: day(20),
        exchange_rate: Some(d("16000")),
    };
    let (paid, _) = service::pay(&pool, actor(), &id, None, input)
        .await
        .unwrap();
    let transaction = paid.transaction.unwrap();

    let moved = TransactionInput {
        kind: TransactionType::Expense,
        wallet_id: USD,
        to_wallet_id: None,
        category_id: None,
        amount: d("640000"),
        to_amount: None,
        original_amount: Some(d("40")),
        original_currency_code: Some("USD"),
        exchange_rate: Some(d("16000")),
        requested_base_rate: None,
        date: day(20),
        name: Some("Budi"),
        description: None,
        attachment_ids: None,
    };
    let refused = ledger::update(&pool, actor(), &transaction.id, moved, None)
        .await
        .unwrap_err();
    assert!(
        matches!(refused, AppError::PaymentTransactionLocked),
        "{refused:?}"
    );
}
