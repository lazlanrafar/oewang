//! One message from Telegram: who it is from, and what it asks for.
//!
//! The order of the checks is the control. The chat must be private; then
//! `/start <token>` may create a link; anything else must arrive in a chat
//! with a live link, from the Telegram account that made it, from someone
//! still a member of the workspace. Only then is it a receipt or a
//! question.

use oewang_clients::telegram::Message;
use oewang_db::repositories::telegram as links;
use oewang_domain::{AppError, Result};

use crate::{
    auth::service::current_role,
    state::AppState,
    telegram::{
        chat,
        link::{self, Started},
        receipt::{self, Attached},
        render, Bot,
    },
};

pub async fn handle(state: &AppState, bot: &Bot, message: Message) -> Result<()> {
    let chat_id = message.chat.id;
    let text = message.text.as_deref().map(str::trim).unwrap_or_default();

    if message.chat.kind != "private" {
        // Said once, in reply to the one thing a person would try in a
        // group. Anything else in a group is not addressed to the bot.
        if text.starts_with("/start") {
            say(bot, chat_id, render::PRIVATE_ONLY).await;
        }
        return Ok(());
    }

    let Some(from) = message.from.as_ref().filter(|from| !from.is_bot) else {
        return Ok(());
    };

    if let Some(argument) = command(text, "start") {
        if !argument.is_empty() {
            match link::start(&state.db, argument, chat_id, from).await? {
                Started::Linked { workspace_name } => {
                    say(bot, chat_id, &render::linked(&workspace_name)).await
                }
                Started::Refused => say(bot, chat_id, render::LINK_REFUSED).await,
            }
            return Ok(());
        }
    }

    let link = links::find_link_for_chat(&state.db, chat_id)
        .await
        .map_err(|error| AppError::Internal(error.into()))?
        // A chat id alone is not enough: the link is for the Telegram
        // account that opened it.
        .filter(|link| link.telegram_user_id == from.id);

    let Some(link) = link else {
        say(bot, chat_id, render::NOT_LINKED).await;
        return Ok(());
    };

    let role = match current_role(&state.db, &link.workspace_id, &link.user_id).await {
        Ok(role) => role,
        Err(AppError::NotAMember) => {
            link::revoke(&state.db, &link).await?;
            say(bot, chat_id, render::NO_LONGER_MEMBER).await;
            return Ok(());
        }
        Err(error) => return Err(error),
    };

    if command(text, "start").is_some() || command(text, "help").is_some() {
        say(bot, chat_id, render::HELP).await;
        return Ok(());
    }
    if command(text, "disconnect").is_some() {
        link::revoke(&state.db, &link).await?;
        say(bot, chat_id, render::DISCONNECTED).await;
        return Ok(());
    }

    match receipt::attachment(&message) {
        Attached::File(upload) => {
            if !role.can_write() {
                say(bot, chat_id, render::MEMBER_CANNOT_WRITE).await;
                return Ok(());
            }
            return receipt::handle(state, bot, &link, upload).await;
        }
        Attached::Unsupported => {
            say(bot, chat_id, render::UNSUPPORTED_FILE).await;
            return Ok(());
        }
        Attached::None => {}
    }

    if text.is_empty() || text.starts_with('/') {
        say(bot, chat_id, render::HELP).await;
        return Ok(());
    }

    chat::handle(state, bot, &link, role, text).await
}

/// The argument of `/name`, `/name arg` or `/name@bot arg`.
fn command<'a>(text: &'a str, name: &str) -> Option<&'a str> {
    let rest = text.strip_prefix('/')?;
    let (head, argument) = rest.split_once(char::is_whitespace).unwrap_or((rest, ""));
    let head = head.split('@').next().unwrap_or(head);
    (head == name).then(|| argument.trim())
}

async fn say(bot: &Bot, chat_id: i64, text: &str) {
    if let Err(error) = bot.client.send_message(chat_id, text, None).await {
        tracing::warn!(%error, "telegram reply not sent");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_read_a_start_token() {
        assert_eq!(command("/start abc_DEF-123", "start"), Some("abc_DEF-123"));
    }

    #[test]
    fn should_read_a_command_addressed_to_the_bot() {
        assert_eq!(command("/help@OewangBot", "help"), Some(""));
    }

    #[test]
    fn should_not_read_another_command_or_plain_text() {
        assert_eq!(command("/started", "start"), None);
        assert_eq!(command("start abc", "start"), None);
    }
}
