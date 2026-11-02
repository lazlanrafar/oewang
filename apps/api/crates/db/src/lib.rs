//! The connection pool and the repositories.
//!
//! The only crate that imports `sqlx`. Every repository method takes
//! `workspace_id` as its first argument and filters on it together with
//! `deleted_at IS NULL`. See docs/best-practices/rust-api.md.
#![forbid(unsafe_code)]
