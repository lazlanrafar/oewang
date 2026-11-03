//! Outbound HTTP: the AI service, object storage and transactional email.
//!
//! Every target comes from configuration. No endpoint ever fetches a
//! user-supplied URL. See docs/security/hardening.md#outbound-calls.
#![forbid(unsafe_code)]

pub mod mailer;
pub mod owe1_client;
pub mod rates;
pub mod storage;

pub use mailer::Mailer;
pub use owe1_client::{EventStream, Owe1Client, Owe1ClientError, StreamEvent};
pub use rates::RatesClient;
pub use storage::{FileStore, Storage};
