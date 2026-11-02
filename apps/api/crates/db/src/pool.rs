//! The connection pool.
//!
//! Limits come from docs/security/hardening.md#limits. Pool exhaustion
//! becomes a fast 503 rather than a hang, and one slow query cannot hold a
//! connection forever.

use std::time::Duration;

use sqlx::postgres::{PgPool, PgPoolOptions};

#[derive(Debug, Clone)]
pub struct PoolConfig {
    pub url: String,
    pub max_connections: u32,
    pub acquire_timeout: Duration,
    pub statement_timeout: Duration,
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            max_connections: 20,
            acquire_timeout: Duration::from_secs(5),
            statement_timeout: Duration::from_secs(10),
        }
    }
}

pub async fn connect(config: &PoolConfig) -> Result<PgPool, sqlx::Error> {
    let statement_timeout_ms = config.statement_timeout.as_millis();

    PgPoolOptions::new()
        .max_connections(config.max_connections)
        .acquire_timeout(config.acquire_timeout)
        .after_connect(move |conn, _meta| {
            Box::pin(async move {
                // Set per connection rather than per query, so a repository
                // cannot forget it.
                sqlx::query(&format!("SET statement_timeout = {statement_timeout_ms}"))
                    .execute(conn)
                    .await?;
                Ok(())
            })
        })
        .connect(&config.url)
        .await
}
