//! Types, errors, money and the rules that do not need a database.
//!
//! This crate depends on neither `oewang-db` nor Axum, which is what keeps the
//! business rules unit-testable without a database and without a server.
//! See docs/best-practices/rust-api.md.
#![forbid(unsafe_code)]
