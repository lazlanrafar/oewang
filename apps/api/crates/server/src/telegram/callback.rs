//! A tapped button under a "Saved" message.
//!
//! The button's data is a claim like any other input. The tap is acted on
//! only when it comes from the linked Telegram account, in the linked chat,
//! by a member who may still write; and the transaction and category it
//! names are looked up in the link's workspace, so a forged id from
//! another workspace is simply not found (AUTH-4).
//!
//! Delete takes two taps, which is D20's confirmation in the shape a
//! button can have.

use oewang_clients::telegram::CallbackQuery;
use oewang_db::repositories::{categories, telegram as links};
use oewang_domain::{AppError, Result};

use crate::{
    audit::{Actor, SOURCE_TELEGRAM},
    auth::service::current_role,
    state::AppState,
    telegram::{
        link, render,
        reply::{self, Action},
        Bot,
    },
    transactions::service as transactions,
};

pub async fn handle(state: &AppState, bot: &Bot, query: CallbackQuery) -> Result<()> {
    let answer = |text: Option<&'static str>| {
        let bot = bot.clone();
        let id = query.id.clone();
        async move {
            bot.client.answer_callback(&id, text).await.ok();
        }
    };

    let (Some(message), Some(action)) = (
        query.message.as_ref(),
        query.data.as_deref().and_then(Action::decode),
    ) else {
        answer(None).await;
        return Ok(());
    };
    let chat_id = message.chat.id;

    let Some(link) = links::find_link_for_chat(&state.db, chat_id)
        .await
        .map_err(internal)?
        .filter(|link| link.telegram_user_id == query.from.id)
    else {
        answer(Some("This chat isn't connected to Oewang.")).await;
        return Ok(());
    };

    match current_role(&state.db, &link.workspace_id, &link.user_id).await {
        Ok(role) if role.can_write() => {}
        Ok(_) => {
            answer(Some("Your role can't change transactions.")).await;
            return Ok(());
        }
        Err(AppError::NotAMember) => {
            link::revoke(&state.db, &link).await?;
            answer(None).await;
            bot.client
                .send_message(chat_id, render::NO_LONGER_MEMBER, None)
                .await
                .ok();
            return Ok(());
        }
        Err(error) => return Err(error),
    }

    let actor = Actor {
        workspace_id: &link.workspace_id,
        user_id: &link.user_id,
        source: SOURCE_TELEGRAM,
    };

    let result = match &action {
        Action::Categorize {
            transaction_id,
            category_id,
        } => {
            let category = categories::find_category(&state.db, &link.workspace_id, category_id)
                .await
                .map_err(internal)?
                .filter(|category| category.r#type == "expense");
            match category {
                Some(category) => transactions::bulk_update(
                    &state.db,
                    actor,
                    std::slice::from_ref(transaction_id),
                    Some(category.id.as_str()),
                )
                .await
                .map(|_| ()),
                None => Err(AppError::CategoryNotFound),
            }
        }
        Action::Delete { transaction_id } => {
            // Ask first. The text stays; only the buttons change.
            transactions::find(&state.db, &link.workspace_id, transaction_id)
                .await
                .map(|_| ())
        }
        Action::ConfirmDelete { transaction_id } => {
            transactions::delete(&state.db, actor, transaction_id).await
        }
        Action::CancelDelete { transaction_id } => {
            transactions::find(&state.db, &link.workspace_id, transaction_id)
                .await
                .map(|_| ())
        }
    };

    match result {
        Ok(()) => {}
        Err(AppError::TransactionNotFound) => {
            answer(Some("That transaction no longer exists.")).await;
            bot.client
                .edit_message(
                    chat_id,
                    message.message_id,
                    message.text.as_deref().unwrap_or("Removed."),
                    None,
                )
                .await
                .ok();
            return Ok(());
        }
        Err(AppError::CategoryNotFound) => {
            answer(Some("That category no longer exists.")).await;
            return Ok(());
        }
        Err(error) => {
            answer(Some("Something went wrong. Please try again.")).await;
            return Err(error);
        }
    }

    match action {
        Action::Delete { transaction_id } => {
            let text = message.text.clone().unwrap_or_default();
            bot.client
                .edit_message(
                    chat_id,
                    message.message_id,
                    &text,
                    Some(&reply::confirm_delete_keyboard(&transaction_id)),
                )
                .await
                .map_err(telegram)?;
            answer(None).await;
        }
        Action::ConfirmDelete { .. } => {
            bot.client
                .edit_message(chat_id, message.message_id, render::DELETED, None)
                .await
                .map_err(telegram)?;
            answer(Some("Deleted.")).await;
        }
        Action::Categorize { transaction_id, .. } | Action::CancelDelete { transaction_id } => {
            let saved = reply::saved(&state.db, &link.workspace_id, &transaction_id, &[]).await?;
            bot.client
                .edit_message(
                    chat_id,
                    message.message_id,
                    &saved.text,
                    Some(&saved.keyboard),
                )
                .await
                .map_err(telegram)?;
            answer(None).await;
        }
    }

    Ok(())
}

fn telegram(error: oewang_clients::telegram::TelegramError) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

fn internal(error: impl Into<anyhow::Error>) -> AppError {
    AppError::Internal(error.into())
}
