//! Types, errors, money and the rules that do not need a database.
//!
//! This crate depends on neither `oewang-db` nor Axum, which is what keeps the
//! business rules unit-testable without a database and without a server.
//! See docs/best-practices/rust-api.md.
#![forbid(unsafe_code)]

pub mod auth;
pub mod envelope;
pub mod error;
pub mod ledger;
pub mod money;
pub mod owe1;
pub mod secret;

pub use auth::Role;
pub use envelope::{Envelope, Meta, PageMeta};
pub use error::{AppError, ErrorBody, FieldErrors};
pub use money::{normalize_currency_code, validate_currency_code};
pub use secret::Secret;

pub type Result<T> = std::result::Result<T, AppError>;
