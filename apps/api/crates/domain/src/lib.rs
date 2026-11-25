//! Types, errors, money and the rules that do not need a database.
//!
//! This crate depends on neither `oewang-db` nor Axum, which is what keeps the
//! business rules unit-testable without a database and without a server.
//! See docs/best-practices/rust-api.md.
#![forbid(unsafe_code)]

pub mod auth;
pub mod budget;
pub mod console;
pub mod csv_import;
pub mod debt;
pub mod envelope;
pub mod error;
pub mod files;
pub mod ledger;
pub mod money;
pub mod owe1;
pub mod passkeys;
pub mod receipt;
pub mod secret;
pub mod spreadsheet;
pub mod tools;
pub mod wallet_totals;

pub use auth::Role;
pub use console::ConsolePermission;
pub use envelope::{Envelope, Meta, Page, PageMeta};
pub use error::{AppError, ErrorBody, FieldErrors};
pub use money::{
    currency_digits, currency_symbol, format_money, normalize_currency_code, validate_currency_code,
};
pub use secret::Secret;

pub type Result<T> = std::result::Result<T, AppError>;
