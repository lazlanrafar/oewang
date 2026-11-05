//! A receipt sent to the bot, saved as an expense (D86).
//!
//! The same pieces the web app's receipt flow uses, in the same order: the
//! bytes go into the vault through the vault's own service (type sniffing,
//! the daily upload ceiling, the audit rows), extraction reads them with no
//! tools (D24), and the API checks the arithmetic (D30). What differs is
//! the last step. The web app shows a sheet and waits; here, sending the
//! photo is the request, so the transaction is saved and the reply carries
//! the undo: a button per category and Delete. AI-2 is amended for this
//! channel in docs/prd.md, and AI-11's flags survive as "Please check".
//!
//! A receipt with no readable total is never saved: there is no amount to
//! save, and a guessed one is worse than asking for a better photo.

use chrono::{TimeZone, Utc};
use oewang_clients::telegram::{Message, TelegramError};
use oewang_db::repositories::{categories, telegram::TelegramLinkRow, wallets};
use oewang_domain::{ledger::TransactionType, AppError, Result};

use crate::{
    ai::{extraction, service as ai},
    audit::{Actor, SOURCE_TELEGRAM},
    state::AppState,
    telegram::{render, reply, Bot},
    transactions::service::{self as transactions, ItemInput, TransactionInput},
    vault::service as vault,
};

/// What the bot accepts as a receipt, by Telegram's own label. The vault
/// sniffs the bytes again and has the last word (SEC-13).
const ACCEPTED: [&str; 4] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/// The file in a message, if it is one the bot reads.
pub struct Upload {
    pub file_id: String,
    pub content_type: String,
    pub name: String,
}

pub enum Attached {
    File(Upload),
    Unsupported,
    None,
}

/// The receipt a message carries. A photo is the largest size Telegram
/// kept; a document is taken at its word on the type, then checked.
pub fn attachment(message: &Message) -> Attached {
    if let Some(sizes) = &message.photo {
        if let Some(largest) = sizes.iter().max_by_key(|size| size.width * size.height) {
            return Attached::File(Upload {
                file_id: largest.file_id.clone(),
                content_type: "image/jpeg".into(),
                name: format!("telegram-{}.jpg", message.message_id),
            });
        }
    }

    if let Some(document) = &message.document {
        let content_type = document.mime_type.clone().unwrap_or_default();
        if !ACCEPTED.contains(&content_type.as_str()) {
            return Attached::Unsupported;
        }
        return Attached::File(Upload {
            file_id: document.file_id.clone(),
            name: document
                .file_name
                .clone()
                .unwrap_or_else(|| format!("telegram-{}", message.message_id)),
            content_type,
        });
    }

    Attached::None
}

/// Save it and answer. Every refusal is a message to the user; an `Err`
/// is only for what the user cannot fix.
pub async fn handle(
    state: &AppState,
    bot: &Bot,
    link: &TelegramLinkRow,
    upload: Upload,
) -> Result<()> {
    let chat_id = link.chat_id;
    let actor = Actor {
        workspace_id: &link.workspace_id,
        user_id: &link.user_id,
        source: SOURCE_TELEGRAM,
    };

    bot.client.send_typing(chat_id).await.ok();

    let max_bytes = u64::try_from(state.config.max_file_bytes).unwrap_or(0);
    let bytes = match bot.client.download(&upload.file_id, max_bytes).await {
        Ok(bytes) => bytes,
        Err(TelegramError::TooLarge) => return say(bot, chat_id, render::FILE_TOO_LARGE).await,
        Err(error) => return Err(AppError::Internal(anyhow::anyhow!(error))),
    };

    // Into the vault exactly as a browser upload goes, so the file is
    // sniffed, counted against the day's ceiling and audited the same way.
    let file_id = match store(state, actor, &upload, &bytes).await {
        Ok(file_id) => file_id,
        Err(AppError::UnsupportedFileType) => {
            return say(bot, chat_id, render::UNSUPPORTED_FILE).await
        }
        Err(AppError::FileTooLarge) => return say(bot, chat_id, render::FILE_TOO_LARGE).await,
        Err(AppError::RateLimited { .. }) => return say(bot, chat_id, render::SLOW_DOWN).await,
        Err(error) => return Err(error),
    };

    bot.client.send_typing(chat_id).await.ok();

    let request_id = cuid2::create_id();
    let outcome = match ai::parse_receipt(
        &state.db,
        &state.files,
        &state.ai,
        &request_id,
        &link.workspace_id,
        &file_id,
    )
    .await
    {
        Ok(outcome) => outcome,
        Err(AppError::ReceiptUnreadable) => {
            return say(bot, chat_id, render::RECEIPT_UNREADABLE).await
        }
        Err(AppError::ExtractionNoAnswer) => {
            return say(bot, chat_id, render::EXTRACTION_NO_ANSWER).await
        }
        Err(AppError::AiUnavailable) => return say(bot, chat_id, render::AI_UNAVAILABLE).await,
        Err(error) => return Err(error),
    };

    let draft = outcome.draft;
    let Some(total) = draft.total.filter(|total| !total.is_zero()) else {
        return say(bot, chat_id, render::RECEIPT_UNREADABLE).await;
    };

    // The account: the default one when it holds this currency, otherwise
    // the first one that does. A receipt is never converted silently.
    let wallets = wallets::list_wallets(&state.db, &link.workspace_id)
        .await
        .map_err(internal)?;
    if wallets.is_empty() {
        return say(bot, chat_id, render::NO_ACCOUNT).await;
    }
    let Some(wallet) = wallets
        .iter()
        .filter(|wallet| wallet.currency_code == draft.currency)
        .max_by_key(|wallet| wallet.is_default)
    else {
        return say(bot, chat_id, &render::currency_mismatch(&draft.currency)).await;
    };

    let expense = categories::list_categories(&state.db, &link.workspace_id, Some("expense"))
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
            &request_id,
            &link.workspace_id,
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

    let attachment_ids = vec![file_id.clone()];
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
        &state.rates,
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
            is_ready: true,
            attachment_ids: Some(&attachment_ids),
        },
        &items,
    )
    .await?;

    let message = reply::saved(&state.db, &link.workspace_id, &saved.id, &check).await?;
    bot.client
        .send_message(chat_id, &message.text, Some(&message.keyboard))
        .await
        .map_err(|error| AppError::Internal(anyhow::anyhow!(error)))?;
    Ok(())
}

/// Reserve, send in chunks, complete: the browser's three steps, in
/// process. Returns the vault file id.
async fn store(
    state: &AppState,
    actor: Actor<'_>,
    upload: &Upload,
    bytes: &[u8],
) -> Result<String> {
    let begun = vault::begin(
        &state.db,
        actor,
        &upload.name,
        &upload.content_type,
        bytes.len() as i64,
        state.config.uploads_per_day,
        state.config.max_file_bytes,
    )
    .await?;

    let chunk_size = usize::try_from(begun.chunk_size)
        .unwrap_or(usize::MAX)
        .max(1);
    for (index, chunk) in bytes.chunks(chunk_size).enumerate() {
        vault::put_chunk(
            &state.db,
            &state.files,
            actor.workspace_id,
            &begun.file.id,
            index as u32,
            chunk,
        )
        .await?;
    }

    let file = vault::complete(&state.db, &state.files, actor, &begun.file.id).await?;
    Ok(file.id)
}

async fn say(bot: &Bot, chat_id: i64, text: &str) -> Result<()> {
    bot.client
        .send_message(chat_id, text, None)
        .await
        .map(|_| ())
        .map_err(|error| AppError::Internal(anyhow::anyhow!(error)))
}

fn internal(error: impl Into<anyhow::Error>) -> AppError {
    AppError::Internal(error.into())
}
