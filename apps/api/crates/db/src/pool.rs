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
                // cannot forget it. `set_config` takes the value as a bound
                // parameter, where `SET` would need it formatted into the SQL.
                sqlx::query("SELECT set_config('statement_timeout', $1, false)")
                    .bind(statement_timeout_ms.to_string())
                    .execute(conn)
                    .await?;
                Ok(())
            })
        })
        .connect(&config.url)
        .await
}

/// Applies the embedded migrations over a connection of their own.
///
/// `url` is the migration role's, which owns the schema. The pool the
/// application serves from connects as a role without DDL rights, so it
/// could not run them (docs/deployment.md#migrations).
pub async fn migrate(url: &str) -> Result<(), sqlx::migrate::MigrateError> {
    let mut migrator = sqlx::migrate!("../../migrations");
    // A migration this binary does not know was applied by a newer release.
    // Ignoring it lets a rollback to an older image start; the rule that
    // makes that safe is that a column drop ships one release after the
    // code stops reading it (docs/deployment.md#migrations).
    migrator.set_ignore_missing(true);

    let pool = PgPoolOptions::new().max_connections(1).connect(url).await?;
    let applied = migrator.run(&pool).await;
    pool.close().await;
    applied
}
