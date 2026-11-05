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

use oewang_clients::telegram::{Message, TelegramError};
use oewang_db::repositories::telegram::TelegramLinkRow;
use oewang_domain::{AppError, Result};

use crate::{
    audit::{Actor, SOURCE_TELEGRAM},
    receipts::{queue, service as receipts},
    state::AppState,
    telegram::{render, reply, Bot},
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

    // The shared read-and-save (D86, D95). What differs here is only how
    // each ending is said.
    let read = match receipts::read_and_save(state, actor, &file_id).await {
        Ok(read) => read,
        Err(AppError::AiUnavailable | AppError::ExtractionNoAnswer) => {
            receipts::Read::Busy(AppError::AiUnavailable.code())
        }
        Err(error) => return Err(error),
    };

    match read {
        receipts::Read::Saved {
            transaction_id,
            check,
        } => {
            let message =
                reply::saved(&state.db, &link.workspace_id, &transaction_id, &check).await?;
            bot.client
                .send_message(chat_id, &message.text, Some(&message.keyboard))
                .await
                .map_err(|error| AppError::Internal(anyhow::anyhow!(error)))?;
            Ok(())
        }
        receipts::Read::Unreadable => say(bot, chat_id, render::RECEIPT_UNREADABLE).await,
        receipts::Read::NoAccount => say(bot, chat_id, render::NO_ACCOUNT).await,
        receipts::Read::CurrencyMismatch(currency) => {
            say(bot, chat_id, &render::currency_mismatch(&currency)).await
        }
        // The reader did not answer: the photo is already in the vault, so
        // it waits there and is read when the reader is back (D95).
        receipts::Read::Busy(_) => {
            queue::enqueue(
                state,
                &link.workspace_id,
                &link.user_id,
                &file_id,
                queue::CHANNEL_TELEGRAM,
                Some(chat_id),
            )
            .await?;
            say(bot, chat_id, render::QUEUED).await
        }
    }
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
