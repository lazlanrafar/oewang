//! The item list and its price history (ITM-1, ITM-2), against a real
//! database, because what is under test is the grouping and the SQL that
//! prices one purchase.

use std::str::FromStr;

use chrono::{TimeZone, Utc};
use oewang_db::repositories::items::{ItemFilters, ItemSort, ItemSortField};
use oewang_domain::{ledger::TransactionType, Page};
use rust_decimal::Decimal;
use sqlx::PgPool;

use crate::{
    audit::Actor,
    items::service,
    transactions::service::{self as ledger, ItemInput, TransactionInput},
};

const WORKSPACE: &str = "ws_items";
const OTHER: &str = "ws_other";
const USER: &str = "usr_items";

fn decimal(value: &str) -> Decimal {
    Decimal::from_str(value).unwrap()
}

async fn workspace(pool: &PgPool, id: &str) {
    sqlx::query(
        "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ($1, $1, $1, 'IDR')",
    )
    .bind(id)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO user_workspaces (id, workspace_id, user_id, role)
         VALUES ($1 || '_m', $1, $2, 'owner')",
    )
    .bind(id)
    .bind(USER)
    .execute(pool)
    .await
    .unwrap();
}

async fn fixture(pool: &PgPool) {
    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'i@example.com', 'x')")
        .bind(USER)
        .execute(pool)
        .await
        .unwrap();
    workspace(pool, WORKSPACE).await;
    workspace(pool, OTHER).await;
    for (id, ws, currency) in [
        ("w_idr", WORKSPACE, "IDR"),
        ("w_sgd", WORKSPACE, "SGD"),
        ("w_other", OTHER, "IDR"),
    ] {
        sqlx::query(
            "INSERT INTO wallets (id, workspace_id, name, currency_code) VALUES ($1, $2, $1, $3)",
        )
        .bind(id)
        .bind(ws)
        .bind(currency)
        .execute(pool)
        .await
        .unwrap();
    }
}

/// One purchase: a transaction on `day` carrying the given items.
async fn buy(pool: &PgPool, workspace_id: &str, wallet: &str, day: u32, items: &[ItemInput<'_>]) {
    let amount = items.iter().map(|item| item.amount).sum();
    ledger::create_with_items(
        pool,
        Actor::web(workspace_id, USER),
        TransactionInput {
            kind: TransactionType::Expense,
            wallet_id: wallet,
            to_wallet_id: None,
            category_id: None,
            amount,
            to_amount: None,
            original_amount: None,
            original_currency_code: None,
            exchange_rate: None,
            // A foreign wallet needs a rate; the value is not under test.
            requested_base_rate: Some(Decimal::from(12_000)),
            date: Utc.with_ymd_and_hms(2026, 11, day, 9, 0, 0).unwrap(),
            name: Some("Market"),
            description: None,
            attachment_ids: None,
        },
        items,
    )
    .await
    .unwrap();
}

fn item<'a>(
    name: &'a str,
    quantity: Option<&str>,
    unit_price: Option<&str>,
    amount: &str,
) -> ItemInput<'a> {
    ItemInput {
        name,
        brand: None,
        quantity: quantity.map(decimal),
        unit: quantity.map(|_| "kg"),
        unit_price: unit_price.map(decimal),
        amount: decimal(amount),
        category_id: None,
        notes: None,
    }
}

fn recent() -> ItemSort {
    ItemSort {
        field: ItemSortField::LastBought,
        descending: true,
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_group_by_name_and_currency_and_price_each_purchase(pool: PgPool) {
    fixture(&pool).await;
    // Unit price given.
    buy(
        &pool,
        WORKSPACE,
        "w_idr",
        1,
        &[item("Beras", Some("5"), Some("14000"), "70000")],
    )
    .await;
    // No unit price: amount over quantity. Different case and spacing, same item.
    buy(
        &pool,
        WORKSPACE,
        "w_idr",
        3,
        &[item(" beras ", Some("2"), None, "31000")],
    )
    .await;
    // No quantity either: the amount is the price.
    buy(
        &pool,
        WORKSPACE,
        "w_idr",
        2,
        &[item("BERAS", None, None, "15000")],
    )
    .await;
    // Same name, other currency: a separate item.
    buy(
        &pool,
        WORKSPACE,
        "w_sgd",
        4,
        &[item("Beras", None, None, "3.50")],
    )
    .await;
    // Another workspace's purchase never shows.
    buy(
        &pool,
        OTHER,
        "w_other",
        5,
        &[item("Beras", None, None, "99999")],
    )
    .await;

    let (rows, total) = service::list(
        &pool,
        WORKSPACE,
        &ItemFilters::default(),
        recent(),
        Page::new(None, None),
    )
    .await
    .unwrap();

    assert_eq!(total, 2);
    let sgd = &rows[0];
    assert_eq!((sgd.currency_code.as_str(), sgd.purchases), ("SGD", 1));

    let idr = &rows[1];
    assert_eq!(idr.key, "beras");
    assert_eq!(
        idr.name, "beras",
        "named as written on the latest purchase, which the write path trimmed"
    );
    assert_eq!(idr.purchases, 3);
    assert_eq!(idr.last_price, decimal("15500"));
    assert_eq!(idr.last_quantity, Some(decimal("2")));
    assert_eq!(idr.min_price, decimal("14000"));
    assert_eq!(idr.max_price, decimal("15500"));

    let (history, count) =
        service::history(&pool, WORKSPACE, "beras", "IDR", Page::new(None, None))
            .await
            .unwrap();
    assert_eq!(count, 3);
    let prices: Vec<_> = history
        .iter()
        .map(|row| row.price.normalize().to_string())
        .collect();
    assert_eq!(prices, ["15500", "15000", "14000"], "newest first");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_search_and_leave_out_deleted_purchases(pool: PgPool) {
    fixture(&pool).await;
    buy(
        &pool,
        WORKSPACE,
        "w_idr",
        1,
        &[item("Telur 1kg", None, None, "28000")],
    )
    .await;
    buy(
        &pool,
        WORKSPACE,
        "w_idr",
        2,
        &[item("Minyak_goreng", None, None, "18000")],
    )
    .await;

    sqlx::query("UPDATE transactions SET deleted_at = now() WHERE workspace_id = $1 AND date::date = '2026-11-01'")
        .bind(WORKSPACE)
        .execute(&pool)
        .await
        .unwrap();

    let all = ItemFilters::default();
    let (rows, _) = service::list(&pool, WORKSPACE, &all, recent(), Page::new(None, None))
        .await
        .unwrap();
    assert_eq!(rows.len(), 1, "an item on a deleted transaction is gone");

    // `_` is a literal underscore, not a single-character wildcard.
    let underscore = ItemFilters {
        search: Some("minyak_"),
        ..Default::default()
    };
    let (rows, _) = service::list(
        &pool,
        WORKSPACE,
        &underscore,
        recent(),
        Page::new(None, None),
    )
    .await
    .unwrap();
    assert_eq!(rows.len(), 1);

    // A currency alone narrows to the items paid for in it.
    let sgd_only = ItemFilters {
        currency: Some("SGD"),
        ..Default::default()
    };
    let (rows, _) = service::list(&pool, WORKSPACE, &sgd_only, recent(), Page::new(None, None))
        .await
        .unwrap();
    assert!(rows.is_empty(), "nothing here was bought in SGD");

    let wildcard = ItemFilters {
        search: Some("minyak%goreng"),
        ..Default::default()
    };
    let (rows, _) = service::list(&pool, WORKSPACE, &wildcard, recent(), Page::new(None, None))
        .await
        .unwrap();
    assert!(rows.is_empty());
}

/// A discount line is not an item. It is reported on every purchase from
/// the same receipt, summed, without being pinned to one item (D97).
#[sqlx::test(migrations = "../../migrations")]
async fn should_leave_discounts_out_and_report_them_per_receipt(pool: PgPool) {
    fixture(&pool).await;
    buy(
        &pool,
        WORKSPACE,
        "w_idr",
        1,
        &[
            item("Sunco 2L", Some("1"), Some("48200"), "48200"),
            item("Disc.", Some("1"), Some("-4000"), "-4000"),
            item("Zen 725", Some("1"), Some("46900"), "46900"),
            item("Disc.", Some("1"), Some("-12000"), "-12000"),
        ],
    )
    .await;
    buy(
        &pool,
        WORKSPACE,
        "w_idr",
        2,
        &[item("Zen 725", None, None, "47000")],
    )
    .await;

    let (rows, total) = service::list(
        &pool,
        WORKSPACE,
        &ItemFilters::default(),
        recent(),
        Page::new(None, None),
    )
    .await
    .unwrap();
    assert_eq!(total, 2, "no row for the discount lines");
    let zen = rows.iter().find(|row| row.key == "zen 725").unwrap();
    assert_eq!(zen.last_discount, None, "the latest receipt had none");
    let sunco = rows.iter().find(|row| row.key == "sunco 2l").unwrap();
    assert_eq!(sunco.last_discount, Some(decimal("-16000")));

    let (history, _) = service::history(&pool, WORKSPACE, "zen 725", "IDR", Page::new(None, None))
        .await
        .unwrap();
    let discounts: Vec<_> = history.iter().map(|row| row.transaction_discount).collect();
    assert_eq!(discounts, [None, Some(decimal("-16000"))]);
}
