//! A text message to the bot, answered by the assistant.
//!
//! The web app's turn, end to end, with a different last mile. The same
//! `begin_turn` persists the message and builds the request; the same turn
//! budget opens (D25); the same pump reads the AI service's stream and
//! stores the reply however it ends (CHAT-9); every tool call is re-checked
//! by `tools::execute` against the membership row. Caps, the delete
//! challenge and the role gate are the API's, so they hold here without a
//! line of Telegram-specific code.
//!
//! What differs: the stream is collected rather than forwarded, because a
//! Telegram message cannot grow token by token without an edit per token,
//! and the finished text is reduced to plain text before it is sent.
//!
//! A chat's conversation is one `ai_sessions` row, made on the first
//! message and kept on the link. It shows in the web chat list like any
//! other conversation, so what was asked from a phone can be read later.

use oewang_db::repositories::{ai as sessions, telegram as links, telegram::TelegramLinkRow};
use oewang_domain::{AppError, Result, Role};
use serde_json::Value;
use tokio::sync::mpsc;

use crate::{
    ai::{
        service as ai,
        stream::{self, Frame, Sealer, AI_STREAM_PATH},
    },
    audit::{Actor, SOURCE_TELEGRAM},
    limits::Bucket,
    owe1::session::now_secs,
    state::AppState,
    telegram::{render, Bot},
};

/// The conversation title, in the web list.
const SESSION_TITLE: &str = "Telegram";

/// How often "typing…" is renewed. Telegram shows it for about five
/// seconds.
const TYPING_EVERY: std::time::Duration = std::time::Duration::from_secs(4);

pub async fn handle(
    state: &AppState,
    bot: &Bot,
    link: &TelegramLinkRow,
    role: Role,
    text: &str,
) -> Result<()> {
    let chat_id = link.chat_id;

    // Per workspace, as on the web: what this bounds is model spend, and
    // spend belongs to a workspace (SEC-17).
    if state
        .rate_limits
        .check(Bucket::ChatTurn, &link.workspace_id, now_secs())
        .is_err()
    {
        return send(bot, chat_id, render::SLOW_DOWN).await;
    }

    let session_id = session(state, link).await?;

    let mut turn = ai::begin_turn(
        &state.db,
        &link.workspace_id,
        &link.user_id,
        role,
        &session_id,
        text,
        &[],
    )
    .await?;
    turn.channel = ai::CHANNEL_TELEGRAM;

    state.turns.open(&turn.turn_id, now_secs());

    let typing = {
        let bot = bot.clone();
        tokio::spawn(async move {
            loop {
                bot.client.send_typing(chat_id).await.ok();
                tokio::time::sleep(TYPING_EVERY).await;
            }
        })
    };

    let answer = collect(state, turn).await;
    typing.abort();

    let reply = match answer {
        Ok(reply) if !reply.trim().is_empty() => render::plain(&reply),
        Ok(_) => render::SOMETHING_WENT_WRONG.to_string(),
        Err(AppError::AiUnavailable) => render::AI_UNAVAILABLE.to_string(),
        Err(error) => return Err(error),
    };

    for part in render::split(&reply) {
        send(bot, chat_id, &part).await?;
    }
    Ok(())
}

/// The link's conversation, made on first use or again if it was deleted
/// from the web.
async fn session(state: &AppState, link: &TelegramLinkRow) -> Result<String> {
    if let Some(id) = &link.ai_session_id {
        if sessions::find_session(&state.db, &link.workspace_id, id)
            .await
            .map_err(internal)?
            .is_some()
        {
            return Ok(id.clone());
        }
    }

    let created = ai::create(
        &state.db,
        Actor {
            workspace_id: &link.workspace_id,
            user_id: &link.user_id,
            source: SOURCE_TELEGRAM,
        },
        Some(SESSION_TITLE),
    )
    .await?;

    links::set_link_session(&state.db, &link.id, &created.id)
        .await
        .map_err(internal)?;
    Ok(created.id)
}

/// Run the turn through the web app's own pump and keep the text.
///
/// No crypto context: these frames never leave the process, so there is
/// no hop to seal them for.
async fn collect(state: &AppState, turn: ai::TurnRequest) -> Result<String> {
    let workspace_id = turn.workspace_id.clone();
    let session_id = turn.session_id.clone();
    let meter = crate::usage::TurnMeter::for_channel(&turn.user_id, turn.channel);

    let events = state
        .ai
        .post_stream(AI_STREAM_PATH, &turn)
        .await
        .map_err(|error| {
            tracing::warn!(
                code = error.code(),
                "the telegram chat stream could not be opened"
            );
            AppError::AiUnavailable
        })?;

    let (sender, mut receiver) = mpsc::channel::<Frame>(64);
    let pump = tokio::spawn(stream::pump(
        events,
        sender,
        state.db.clone(),
        workspace_id,
        session_id,
        Sealer::new(None),
        state.config.chat_stream_timeout,
        // Telegram draws no canvas; what the tools left is swept.
        None,
        meter,
    ));

    let mut reply = String::new();
    let mut failed = false;
    while let Some(frame) = receiver.recv().await {
        let payload: Value = serde_json::from_str(&frame.data).unwrap_or(Value::Null);
        match frame.name.as_str() {
            "token" => {
                if let Some(text) = payload.get("text").and_then(Value::as_str) {
                    reply.push_str(text);
                }
            }
            "error" => failed = true,
            "done" => break,
            _ => {}
        }
    }
    pump.await.ok();

    if failed && reply.trim().is_empty() {
        return Err(AppError::AiUnavailable);
    }
    Ok(reply)
}

async fn send(bot: &Bot, chat_id: i64, text: &str) -> Result<()> {
    bot.client
        .send_message(chat_id, text, None)
        .await
        .map(|_| ())
        .map_err(|error| AppError::Internal(anyhow::anyhow!(error)))
}

fn internal(error: impl Into<anyhow::Error>) -> AppError {
    AppError::Internal(error.into())
}
