//! Outbound HTTP: the AI service and object storage.
//!
//! Both targets come from configuration. No endpoint ever fetches a
//! user-supplied URL. See docs/security/hardening.md.
#![forbid(unsafe_code)]
