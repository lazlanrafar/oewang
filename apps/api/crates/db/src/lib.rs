//! The connection pool and the repositories.
//!
//! The only crate that imports `sqlx`. Every repository method takes
//! `workspace_id` as its first argument and filters on it together with
//! `deleted_at IS NULL`. See docs/best-practices/rust-api.md.
#![forbid(unsafe_code)]

pub mod pool;
pub mod repositories;
pub mod seed;

pub use pool::{connect, PoolConfig};
pub use sqlx::PgPool;

/// The migrations, embedded so the binary can apply them without sqlx-cli.
pub static MIGRATIONS: sqlx::migrate::Migrator = sqlx::migrate!("../../migrations");
