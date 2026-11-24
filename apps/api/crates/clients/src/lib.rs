//! Outbound HTTP: the AI service, object storage, transactional email, the
//! rate source, the Telegram Bot API and push notifications (FCM).
//!
//! Every target comes from configuration. No endpoint ever fetches a
//! user-supplied URL. See docs/security/hardening.md#outbound-calls.
#![forbid(unsafe_code)]

pub mod mailer;
pub mod owe1_client;
pub mod push;
pub mod rates;
pub mod storage;
pub mod telegram;

pub use mailer::Mailer;
pub use owe1_client::{EventStream, Owe1Client, Owe1ClientError, StreamEvent};
pub use push::{Delivery, FcmClient, PushMessage, PushSender};
pub use rates::{RatesClient, Snapshot};
pub use storage::{FileStore, Storage};
pub use telegram::TelegramClient;
