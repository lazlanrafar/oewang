//! A receipt read and saved as an expense, wherever it came from (D86,
//! D95): the bot, the web's scan, or the queue retrying one the reader
//! could not answer for.
//!
//! The pieces the web confirmation flow uses, in the same order: extraction
//! reads the vault file with no tools (D24), the API checks the arithmetic
//! (D30), and the expense is saved to the default account holding the
//! receipt's currency, with a category the model picked by name (D86). A
//! receipt with no readable total is never saved: there is no amount to
//! save, and a guessed one is worse than asking for a better photo.

use chrono::{TimeZone, Utc};
use oewang_db::repositories::{categories, receipts as jobs, wallets};
use oewang_domain::{ledger::TransactionType, AppError, Result};

use crate::{
    ai::{extraction, service as ai},
    audit::Actor,
    state::AppState,
    transactions::service::{self as transactions, ItemInput, TransactionInput},
};

/// How reading a receipt ended. Only `Saved` wrote anything.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Read {
    /// The expense exists. `check` names the fields worth a second look.
    Saved {
        transaction_id: String,
        check: Vec<String>,
    },
    /// Nothing on it to save: no total.
    Unreadable,
    /// The workspace has no account at all.
    NoAccount,
    /// No account holds this currency, and a receipt is never converted
    /// silently.
    CurrencyMismatch(String),
    /// The reader did not answer. Worth asking again later; the code says
    /// which way it failed.
    Busy(&'static str),
}

/// Read a vault file and, when it reads, save it.
///
/// A file already attached to a live transaction is that transaction: a job
/// retried after a crash between the save and its `done` mark must not save
/// the same receipt twice.
pub async fn read_and_save(state: &AppState, actor: Actor<'_>, file_id: &str) -> Result<Read> {
    if let Some(transaction_id) = jobs_saved_already(state, actor.workspace_id, file_id).await? {
        return Ok(Read::Saved {
            transaction_id,
            check: Vec::new(),
        });
    }

    let request_id = cuid2::create_id();
    let outcome = match ai::parse_receipt(
        &state.db,
        &state.files,
        &state.ai,
        &request_id,
        actor.workspace_id,
        Some(actor.user_id),
        file_id,
    )
    .await
    {
        Ok(outcome) => outcome,
        Err(AppError::ReceiptUnreadable) => return Ok(Read::Unreadable),
        // The reader did not answer. The photo is fine and stays in the
        // vault; whoever asked may queue it (D95).
        Err(error @ (AppError::ExtractionNoAnswer | AppError::AiUnavailable)) => {
            return Ok(Read::Busy(error.code()))
        }
        Err(error) => return Err(error),
    };

    let draft = outcome.draft;
    let Some(total) = draft.total.filter(|total| !total.is_zero()) else {
        return Ok(Read::Unreadable);
    };

    // The account: the default one when it holds this currency, otherwise
    // the first one that does. A receipt is never converted silently.
    let wallets = wallets::list_wallets(&state.db, actor.workspace_id)
        .await
        .map_err(internal)?;
    if wallets.is_empty() {
        return Ok(Read::NoAccount);
    }
    let Some(wallet) = wallets
        .iter()
        .filter(|wallet| wallet.currency_code == draft.currency)
        .max_by_key(|wallet| wallet.is_default)
    else {
        return Ok(Read::CurrencyMismatch(draft.currency.clone()));
    };

    let expense = categories::list_categories(&state.db, actor.workspace_id, Some("expense"))
        .await
        .map_err(internal)?;
    let category_id = {
        let names: Vec<&str> = expense
            .iter()
            .map(|category| category.name.as_str())
            .collect();
        let items: Vec<&str> = draft
            .line_items
            .iter()
            .map(|item| item.name.as_str())
            .collect();
        extraction::categorize(
            &state.ai,
            crate::usage::Meter::new(&state.db, actor.workspace_id, Some(actor.user_id)),
            &request_id,
            draft.merchant.as_deref(),
            &items,
            &names,
        )
        .await
        .and_then(|chosen| expense.iter().find(|category| category.name == chosen))
        .map(|category| category.id.clone())
    };

    let mut check: Vec<String> = outcome
        .quality
        .low_confidence_fields
        .iter()
        .cloned()
        .chain(
            outcome
                .quality
                .corrected_fields
                .iter()
                .map(|correction| correction.field.clone()),
        )
        .map(|field| {
            if field == "line_items" {
                "items".into()
            } else {
                field
            }
        })
        .collect();

    let date = match draft.date {
        Some(date) => date,
        None => {
            // A receipt with a total and no readable date is saved as
            // today's, and the reply says so.
            check.push("date".into());
            Utc::now().date_naive()
        }
    };
    check.sort();
    check.dedup();

    let attachment_ids = vec![file_id.to_string()];
    let items: Vec<ItemInput<'_>> = draft
        .line_items
        .iter()
        .filter_map(|item| {
            let amount = item.amount.filter(|amount| !amount.is_zero())?;
            (!item.name.trim().is_empty()).then_some(ItemInput {
                name: item.name.as_str(),
                brand: None,
                quantity: item
                    .quantity
                    .filter(|quantity| quantity.is_sign_positive() && !quantity.is_zero()),
                unit: None,
                unit_price: item.unit_price,
                amount,
                category_id: None,
                notes: None,
            })
        })
        .collect();

    let name = draft
        .merchant
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty());

    let saved = transactions::create_with_items(
        &state.db,
        actor,
        TransactionInput {
            kind: TransactionType::Expense,
            wallet_id: &wallet.id,
            to_wallet_id: None,
            category_id: category_id.as_deref(),
            amount: total,
            to_amount: None,
            original_amount: None,
            original_currency_code: None,
            exchange_rate: None,
            requested_base_rate: None,
            date: Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0).unwrap_or_default()),
            name: Some(name.unwrap_or("Receipt")),
            description: None,
            attachment_ids: Some(&attachment_ids),
        },
        &items,
    )
    .await?;

    Ok(Read::Saved {
        transaction_id: saved.id,
        check,
    })
}

async fn jobs_saved_already(
    state: &AppState,
    workspace_id: &str,
    file_id: &str,
) -> Result<Option<String>> {
    jobs::transaction_for_file(&state.db, workspace_id, file_id)
        .await
        .map_err(internal)
}

fn internal(error: impl Into<anyhow::Error>) -> AppError {
    AppError::Internal(error.into())
}
