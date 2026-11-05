//! Long polling for updates, in this process (D84).
//!
//! One loop asks Telegram for updates and waits up to 50 seconds for an
//! answer. Asking with `offset = last + 1` is what tells Telegram the
//! earlier ones arrived, so an update that was claimed but not finished
//! when the process stopped comes back on restart. The claim table makes
//! that harmless: an update id is handled once, ever, however often it is
//! delivered (`telegram_updates`).
//!
//! Updates from one chat are handled in order, one at a time, so a photo
//! and the question sent right after it are answered in that order and two
//! taps on one message cannot interleave. Different chats run in parallel.
//!
//! Exactly one process may poll a bot; a second one gets 409 from Telegram.
//! D75 already makes this a single-instance service.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};

use chrono::{Duration as ChronoDuration, Utc};
use oewang_clients::telegram::{TelegramError, Update};
use oewang_db::repositories::telegram as repo;
use tokio::sync::mpsc;

use crate::{
    state::AppState,
    telegram::{callback, message, render, Bot},
};

/// How long one poll waits for an update before asking again.
const POLL_WAIT: Duration = Duration::from_secs(50);
/// The pause after a failed poll, doubling to the ceiling.
const BACKOFF_START: Duration = Duration::from_secs(2);
const BACKOFF_MAX: Duration = Duration::from_secs(60);
/// A chat's queue closes after this long without a message.
const CHAT_IDLE: Duration = Duration::from_secs(120);
/// Telegram keeps an unconfirmed update for a day. A claim older than
/// that can never be delivered again.
const CLAIM_KEEP_HOURS: i64 = 48;

type Queues = Arc<Mutex<HashMap<i64, mpsc::UnboundedSender<Update>>>>;

/// Start polling, if a bot is configured.
pub fn spawn(state: AppState) {
    let Some(bot) = state.telegram.clone() else {
        tracing::info!("telegram bot not configured; not polling");
        return;
    };

    spawn_claim_sweeper(state.clone());

    tokio::spawn(async move {
        if let Err(error) = bot.client.delete_webhook().await {
            tracing::warn!(%error, "telegram deleteWebhook failed; polling anyway");
        }
        tracing::info!(bot = %bot.username, "telegram polling started");

        let queues: Queues = Arc::default();
        let mut offset: Option<i64> = None;
        let mut backoff = BACKOFF_START;

        loop {
            match bot.client.get_updates(offset, POLL_WAIT).await {
                Ok(updates) => {
                    backoff = BACKOFF_START;
                    for update in updates {
                        offset = Some(update.update_id + 1);
                        accept(&state, &bot, &queues, update).await;
                    }
                }
                Err(TelegramError::Api { code: 409, .. }) => {
                    // Another poller or a webhook holds this bot.
                    tracing::warn!("telegram says another client is polling this bot");
                    tokio::time::sleep(BACKOFF_MAX).await;
                }
                Err(TelegramError::Api {
                    retry_after: Some(seconds),
                    ..
                }) => {
                    tokio::time::sleep(Duration::from_secs(seconds)).await;
                }
                Err(error) => {
                    tracing::warn!(%error, "telegram poll failed");
                    tokio::time::sleep(backoff).await;
                    backoff = (backoff * 2).min(BACKOFF_MAX);
                }
            }
        }
    });
}

/// Claim the update, then hand it to its chat's queue.
async fn accept(state: &AppState, bot: &Bot, queues: &Queues, update: Update) {
    match repo::claim_update(&state.db, update.update_id).await {
        Ok(true) => {}
        Ok(false) => return,
        Err(error) => {
            // Not handled rather than handled twice: a receipt saved twice
            // is worse than one the user resends.
            tracing::warn!(%error, update_id = update.update_id, "telegram update not claimed");
            return;
        }
    }

    let Some(chat_id) = chat_of(&update) else {
        return;
    };

    let mut queues_guard = queues
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(sender) = queues_guard.get(&chat_id) {
        match sender.send(update) {
            Ok(()) => return,
            // The worker is gone; start a new one below with the update.
            Err(mpsc::error::SendError(update)) => {
                queues_guard.remove(&chat_id);
                start_worker(state, bot, queues, &mut queues_guard, chat_id, update);
            }
        }
        return;
    }
    start_worker(state, bot, queues, &mut queues_guard, chat_id, update);
}

fn start_worker(
    state: &AppState,
    bot: &Bot,
    queues: &Queues,
    guard: &mut HashMap<i64, mpsc::UnboundedSender<Update>>,
    chat_id: i64,
    first: Update,
) {
    let (sender, mut receiver) = mpsc::unbounded_channel::<Update>();
    sender.send(first).ok();
    guard.insert(chat_id, sender.clone());

    let state = state.clone();
    let bot = bot.clone();
    let queues = queues.clone();

    tokio::spawn(async move {
        loop {
            match tokio::time::timeout(CHAT_IDLE, receiver.recv()).await {
                Ok(Some(update)) => handle(&state, &bot, update).await,
                Ok(None) => return,
                Err(_) => {
                    // Idle. Close under the lock, unless something arrived
                    // between the timeout and here.
                    let pending = {
                        let mut guard = queues
                            .lock()
                            .unwrap_or_else(|poisoned| poisoned.into_inner());
                        match receiver.try_recv() {
                            Ok(update) => Some(update),
                            Err(_) => {
                                if guard
                                    .get(&chat_id)
                                    .is_some_and(|current| current.same_channel(&sender))
                                {
                                    guard.remove(&chat_id);
                                }
                                None
                            }
                        }
                    };
                    match pending {
                        Some(update) => handle(&state, &bot, update).await,
                        None => return,
                    }
                }
            }
        }
    });
}

/// One update, start to finish. A failure is logged by its code and
/// answered with an apology; it never stops the chat's queue.
async fn handle(state: &AppState, bot: &Bot, update: Update) {
    let chat_id = chat_of(&update);

    let result = if let Some(query) = update.callback_query {
        callback::handle(state, bot, query).await
    } else if let Some(message) = update.message {
        message::handle(state, bot, message).await
    } else {
        Ok(())
    };

    if let Err(error) = result {
        tracing::warn!(code = error.code(), "telegram update failed");
        if let Some(chat_id) = chat_id {
            bot.client
                .send_message(chat_id, render::SOMETHING_WENT_WRONG, None)
                .await
                .ok();
        }
    }
}

fn chat_of(update: &Update) -> Option<i64> {
    update
        .message
        .as_ref()
        .map(|message| message.chat.id)
        .or_else(|| {
            update
                .callback_query
                .as_ref()
                .and_then(|query| query.message.as_ref())
                .map(|message| message.chat.id)
        })
}

fn spawn_claim_sweeper(state: AppState) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(3600));
        loop {
            ticker.tick().await;
            let before = Utc::now() - ChronoDuration::hours(CLAIM_KEEP_HOURS);
            match repo::prune_updates(&state.db, before).await {
                Ok(0) => {}
                Ok(removed) => tracing::debug!(removed, "pruned telegram update claims"),
                Err(error) => tracing::warn!(%error, "telegram update claims not pruned"),
            }
        }
    });
}
