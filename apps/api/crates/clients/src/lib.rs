//! Outbound HTTP: the AI service, object storage and transactional email.
//!
//! Every target comes from configuration. No endpoint ever fetches a
//! user-supplied URL. See docs/security/hardening.md#outbound-calls.
#![forbid(unsafe_code)]

pub mod mailer;
pub mod rates;

pub use mailer::Mailer;
pub use rates::RatesClient;
