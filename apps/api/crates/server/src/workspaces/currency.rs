//! Converting the workspace currency once the ledger has rows (WAL-7, D105).
//!
//! Changing the currency in place would relabel every `base_amount` without
//! changing its number, which is why the plain change is locked (WAL-6).
//! This is the other way: one rate, chosen by the owner, applied to every
//! transaction and every budget in one database transaction. Every figure
//! from before then reads as its value at that rate, not at the rate of its
//! own day; the page says so before anything is changed.

use chrono::NaiveDate;
use oewang_db::repositories::{accounts, budgets, fx};
use oewang_domain::{ledger::round_rate, validate_currency_code, AppError, Result};
use rust_decimal::Decimal;
use serde::Serialize;
use serde_json::json;
use sqlx::PgPool;

use crate::audit::{log, Actor};

/// What a conversion would touch, and the rate to start from.
#[derive(Debug, Serialize)]
pub struct Preview {
    pub from: String,
    pub to: String,
    /// Units of `to` per unit of `from`, from the newest stored snapshot.
    /// None when no snapshot holds the pair; the owner types one.
    #[serde(with = "rust_decimal::serde::str_option")]
    pub suggested_rate: Option<Decimal>,
    pub rate_date: Option<NaiveDate>,
    pub transactions: i64,
    pub budgets: i64,
}

#[derive(Debug, Serialize)]
pub struct Converted {
    pub from: String,
    pub to: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub rate: Decimal,
    pub transactions: u64,
    pub budgets: u64,
}

pub async fn preview(pool: &PgPool, workspace_id: &str, to: &str) -> Result<Preview> {
    let to = validate_currency_code("currency_code", to)?;
    let from = accounts::find_workspace(pool, workspace_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?
        .currency_code;

    let suggested = if from == to {
        None
    } else {
        fx::newest_rate(pool, &from, &to).await.map_err(internal)?
    };
    let transactions = accounts::count_live_transactions(pool, workspace_id)
        .await
        .map_err(internal)?;
    let budgets = budgets::count_live(pool, workspace_id)
        .await
        .map_err(internal)?;

    Ok(Preview {
        from,
        to,
        suggested_rate: suggested.as_ref().map(|row| round_rate(row.rate)),
        rate_date: suggested.map(|row| row.date),
        transactions,
        budgets,
    })
}

/// Convert, owner only (the extractor checks the role).
///
/// The workspace row is locked first. Every write that computes a
/// `base_amount` reads the currency under a share lock and checks it again
/// (`transactions::service`), so a row cannot be written in the old
/// currency after this commits.
pub async fn convert(
    pool: &PgPool,
    actor: Actor<'_>,
    currency_code: &str,
    rate: Decimal,
) -> Result<Converted> {
    let to = validate_currency_code("currency_code", currency_code)?;
    let rate = round_rate(rate);
    if rate <= Decimal::ZERO {
        return Err(AppError::validation([("rate", "Enter a rate above zero.")]));
    }

    let mut tx = pool.begin().await.map_err(internal)?;
    let from = accounts::lock_workspace_currency(&mut *tx, actor.workspace_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    if from == to {
        return Err(AppError::validation([(
            "currency_code",
            "This is already the workspace currency.",
        )]));
    }

    let transactions = accounts::convert_transactions(&mut *tx, actor.workspace_id, &to, rate)
        .await
        .map_err(internal)?;
    let budgets = budgets::convert(&mut *tx, actor.workspace_id, rate)
        .await
        .map_err(internal)?;
    accounts::update_workspace_currency(&mut *tx, actor.workspace_id, &to)
        .await
        .map_err(internal)?;

    log(
        &mut tx,
        actor,
        "workspace.currency_converted",
        "workspace",
        actor.workspace_id,
        Some(json!({ "currency_code": from })),
        Some(json!({
            "currency_code": to,
            "rate": rate.to_string(),
            "transactions": transactions,
            "budgets": budgets,
        })),
    )
    .await?;
    tx.commit().await.map_err(internal)?;

    Ok(Converted {
        from,
        to,
        rate,
        transactions,
        budgets,
    })
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}
