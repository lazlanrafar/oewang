//! The Telegram Bot API (D84).
//!
//! One fixed host from configuration. The bot token is part of every URL
//! path (`/bot<token>/<method>`), which makes the URL itself a secret: it is
//! never logged, and every `reqwest` error is stripped of its URL before it
//! leaves this module, because the error's `Display` prints it otherwise.
//!
//! Text goes out without `parse_mode`. A reply can quote what a receipt or
//! the model said, and in Markdown or HTML mode a stray `*` or `<` either
//! fails the whole send or turns into formatting nobody asked for. Plain
//! text has no syntax to inject into (docs/security/ai-safety.md).

use std::time::Duration;

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};

/// A send or an edit. Short: the user is looking at a chat waiting for it.
const CALL_TIMEOUT: Duration = Duration::from_secs(15);
/// On top of the long-poll wait, so a poll that is answered at the last
/// second is not cut off.
const POLL_SLACK: Duration = Duration::from_secs(10);
/// A file download. Telegram serves bot files up to 20 MB.
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, thiserror::Error)]
pub enum TelegramError {
    /// The request never got an answer. The URL has already been removed.
    #[error("telegram unreachable: {0}")]
    Network(String),
    /// Telegram answered `ok: false`. `retry_after` is set on a 429.
    #[error("telegram refused ({code}): {description}")]
    Api {
        code: i64,
        description: String,
        retry_after: Option<u64>,
    },
    #[error("telegram file is larger than allowed")]
    TooLarge,
    #[error("telegram answer did not parse")]
    Malformed,
}

impl TelegramError {
    fn network(error: reqwest::Error) -> Self {
        Self::Network(error.without_url().to_string())
    }

    /// A message that is already in the state an edit asks for. Telegram
    /// reports it as an error; for this app it is a success.
    pub fn is_not_modified(&self) -> bool {
        matches!(self, Self::Api { description, .. } if description.contains("message is not modified"))
    }
}

pub type TelegramResult<T> = Result<T, TelegramError>;

// ------------------------------------------------------------------ types
//
// Only the fields this app reads. Telegram adds fields freely; serde
// ignores the rest.

#[derive(Debug, Clone, Deserialize)]
pub struct Update {
    pub update_id: i64,
    pub message: Option<Message>,
    pub callback_query: Option<CallbackQuery>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Message {
    pub message_id: i64,
    pub chat: Chat,
    pub from: Option<User>,
    pub text: Option<String>,
    pub caption: Option<String>,
    pub photo: Option<Vec<PhotoSize>>,
    pub document: Option<Document>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Chat {
    pub id: i64,
    /// `private`, `group`, `supergroup` or `channel`.
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct User {
    pub id: i64,
    #[serde(default)]
    pub is_bot: bool,
    pub username: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PhotoSize {
    pub file_id: String,
    pub file_size: Option<i64>,
    pub width: i64,
    pub height: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Document {
    pub file_id: String,
    pub file_name: Option<String>,
    pub mime_type: Option<String>,
    pub file_size: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CallbackQuery {
    pub id: String,
    pub from: User,
    pub message: Option<Message>,
    pub data: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
pub struct InlineKeyboard {
    pub inline_keyboard: Vec<Vec<InlineButton>>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct InlineButton {
    pub text: String,
    /// At most 64 bytes, by Telegram's rule.
    pub callback_data: String,
}

#[derive(Debug, Deserialize)]
struct Answer<T> {
    ok: bool,
    result: Option<T>,
    description: Option<String>,
    error_code: Option<i64>,
    parameters: Option<AnswerParameters>,
}

#[derive(Debug, Deserialize)]
struct AnswerParameters {
    retry_after: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct SentMessage {
    message_id: i64,
}

#[derive(Debug, Deserialize)]
struct FileInfo {
    file_path: Option<String>,
    file_size: Option<i64>,
}

// ----------------------------------------------------------------- client

#[derive(Clone)]
pub struct TelegramClient {
    http: reqwest::Client,
    base_url: String,
    token: String,
}

impl std::fmt::Debug for TelegramClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // The token never reaches a log line (OPS-3).
        f.debug_struct("TelegramClient")
            .field("base_url", &self.base_url)
            .finish()
    }
}

impl TelegramClient {
    pub fn new(base_url: String, token: String) -> Self {
        Self {
            http: reqwest::Client::builder().build().unwrap_or_default(),
            base_url: base_url.trim_end_matches('/').to_string(),
            token,
        }
    }

    /// Wait up to `wait` for updates after `offset`. Asking with an offset
    /// is what confirms everything before it, so an update is only ever
    /// confirmed after the one before it was handled.
    pub async fn get_updates(
        &self,
        offset: Option<i64>,
        wait: Duration,
    ) -> TelegramResult<Vec<Update>> {
        let mut body = json!({
            "timeout": wait.as_secs(),
            "allowed_updates": ["message", "callback_query"],
        });
        if let Some(offset) = offset {
            body["offset"] = json!(offset);
        }
        self.call("getUpdates", &body, wait + POLL_SLACK).await
    }

    /// Long polling and a webhook cannot both be set. Cleared at start, so a
    /// bot that was once pointed at a webhook still receives updates here.
    pub async fn delete_webhook(&self) -> TelegramResult<()> {
        let _: bool = self.call("deleteWebhook", &json!({}), CALL_TIMEOUT).await?;
        Ok(())
    }

    pub async fn send_message(
        &self,
        chat_id: i64,
        text: &str,
        keyboard: Option<&InlineKeyboard>,
    ) -> TelegramResult<i64> {
        let mut body = json!({
            "chat_id": chat_id,
            "text": text,
            "link_preview_options": { "is_disabled": true },
        });
        if let Some(keyboard) = keyboard {
            body["reply_markup"] = json!(keyboard);
        }
        let sent: SentMessage = self.call("sendMessage", &body, CALL_TIMEOUT).await?;
        Ok(sent.message_id)
    }

    /// Replace a message's text and its buttons. `None` removes the buttons.
    pub async fn edit_message(
        &self,
        chat_id: i64,
        message_id: i64,
        text: &str,
        keyboard: Option<&InlineKeyboard>,
    ) -> TelegramResult<()> {
        let body = json!({
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
            "link_preview_options": { "is_disabled": true },
            "reply_markup": keyboard.cloned().unwrap_or_default(),
        });
        match self
            .call::<Value>("editMessageText", &body, CALL_TIMEOUT)
            .await
        {
            Ok(_) => Ok(()),
            Err(error) if error.is_not_modified() => Ok(()),
            Err(error) => Err(error),
        }
    }

    /// Stop the spinner on a tapped button, optionally with a short toast.
    pub async fn answer_callback(
        &self,
        callback_id: &str,
        text: Option<&str>,
    ) -> TelegramResult<()> {
        let mut body = json!({ "callback_query_id": callback_id });
        if let Some(text) = text {
            body["text"] = json!(text);
        }
        let _: bool = self
            .call("answerCallbackQuery", &body, CALL_TIMEOUT)
            .await?;
        Ok(())
    }

    /// "typing…" under the chat title for about five seconds.
    pub async fn send_typing(&self, chat_id: i64) -> TelegramResult<()> {
        let body = json!({ "chat_id": chat_id, "action": "typing" });
        let _: bool = self.call("sendChatAction", &body, CALL_TIMEOUT).await?;
        Ok(())
    }

    /// The bytes of a file a user sent, up to `max_bytes`.
    ///
    /// The path comes from Telegram's own `getFile` answer and is fetched
    /// from the configured host only, never followed as a URL (SEC-14).
    pub async fn download(&self, file_id: &str, max_bytes: u64) -> TelegramResult<Vec<u8>> {
        let info: FileInfo = self
            .call("getFile", &json!({ "file_id": file_id }), CALL_TIMEOUT)
            .await?;

        if info
            .file_size
            .is_some_and(|size| size < 0 || size as u64 > max_bytes)
        {
            return Err(TelegramError::TooLarge);
        }
        let path = info.file_path.ok_or(TelegramError::Malformed)?;
        if !is_safe_file_path(&path) {
            return Err(TelegramError::Malformed);
        }

        let url = format!("{}/file/bot{}/{}", self.base_url, self.token, path);
        let mut response = self
            .http
            .get(url)
            .timeout(DOWNLOAD_TIMEOUT)
            .send()
            .await
            .map_err(TelegramError::network)?;

        if !response.status().is_success() {
            return Err(TelegramError::Api {
                code: i64::from(response.status().as_u16()),
                description: "file download refused".into(),
                retry_after: None,
            });
        }

        // Counted as it arrives, so a file that lied about its size is cut
        // off at the limit rather than read whole first.
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(TelegramError::network)? {
            if (bytes.len() + chunk.len()) as u64 > max_bytes {
                return Err(TelegramError::TooLarge);
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }

    async fn call<T: DeserializeOwned>(
        &self,
        method: &str,
        body: &Value,
        timeout: Duration,
    ) -> TelegramResult<T> {
        let url = format!("{}/bot{}/{}", self.base_url, self.token, method);
        let response = self
            .http
            .post(url)
            .timeout(timeout)
            .json(body)
            .send()
            .await
            .map_err(TelegramError::network)?;

        let answer: Answer<T> = response
            .json()
            .await
            .map_err(|_| TelegramError::Malformed)?;
        if answer.ok {
            return answer.result.ok_or(TelegramError::Malformed);
        }

        Err(TelegramError::Api {
            code: answer.error_code.unwrap_or_default(),
            description: answer.description.unwrap_or_default(),
            retry_after: answer
                .parameters
                .and_then(|parameters| parameters.retry_after),
        })
    }
}

/// A `file_path` as Telegram returns it: relative, like `photos/file_3.jpg`.
/// Anything that could leave the bot's file directory or name another host
/// is refused rather than fetched.
fn is_safe_file_path(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 256
        && !path.starts_with('/')
        && !path.contains("..")
        && !path.contains("://")
        && path
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '-' | '.'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_accept_a_path_as_telegram_returns_it() {
        assert!(is_safe_file_path("photos/file_3.jpg"));
        assert!(is_safe_file_path("documents/file_12.pdf"));
    }

    #[test]
    fn should_refuse_a_path_that_could_leave_the_file_directory() {
        assert!(!is_safe_file_path("../bot123/getMe"));
        assert!(!is_safe_file_path("/etc/passwd"));
        assert!(!is_safe_file_path("https://evil.example/x.jpg"));
        assert!(!is_safe_file_path("photos/a b.jpg"));
        assert!(!is_safe_file_path(""));
    }

    #[test]
    fn should_not_print_the_token() {
        let client = TelegramClient::new("https://api.telegram.org".into(), "123:secret".into());
        assert!(!format!("{client:?}").contains("secret"));
    }

    #[test]
    fn should_read_an_update_with_only_the_fields_it_needs() {
        let update: Update = serde_json::from_value(json!({
            "update_id": 7,
            "message": {
                "message_id": 3,
                "date": 0,
                "chat": { "id": 42, "type": "private", "first_name": "A" },
                "from": { "id": 42, "is_bot": false, "first_name": "A", "username": "a" },
                "photo": [{ "file_id": "f", "file_unique_id": "u", "width": 90, "height": 90 }]
            }
        }))
        .unwrap();

        let message = update.message.unwrap();
        assert_eq!(message.chat.kind, "private");
        assert_eq!(message.photo.unwrap()[0].file_id, "f");
    }
}
