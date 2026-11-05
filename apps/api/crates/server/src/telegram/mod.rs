//! Telegram: a private chat that can save receipts and talk to the
//! assistant on a user's behalf (docs/features/telegram.md, D83 to D86).
//!
//! Inbound is long polling from this process (D84): no public route, no
//! webhook secret, no plaintext exception to OWE1. Outbound is the Bot API
//! on one configured host.
//!
//! Who a message is from is decided by one thing only: the live link row
//! for the chat it arrived in, created by a one-time token the user opened
//! from the Apps page (D85). Every update then re-reads the membership row,
//! as a tool call does, so a removed or demoted member stops being able to
//! write from Telegram the moment they stop being able to write on the web.
//!
//! Nothing here logs a message, a caption, a file or a reply (OPS-3).

pub mod callback;
pub mod chat;
pub mod handler;
pub mod link;
pub mod message;
pub mod poller;
pub mod receipt;
pub mod render;
pub mod reply;

use oewang_clients::TelegramClient;

/// The bot this server runs, when one is configured.
#[derive(Debug, Clone)]
pub struct Bot {
    pub client: TelegramClient,
    /// Without the `@`.
    pub username: String,
}

impl Bot {
    pub fn deep_link(&self, start: &str) -> String {
        format!("https://t.me/{}?start={start}", self.username)
    }
}

#[cfg(test)]
mod tests;
