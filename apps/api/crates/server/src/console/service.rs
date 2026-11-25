//! Console rules (CSL).

use oewang_db::repositories::console::{self, OperatorRow};
use oewang_domain::{AppError, Result};
use sqlx::PgPool;

/// The user's console role, or CONSOLE_FORBIDDEN when they hold none.
pub async fn operator(pool: &PgPool, user_id: &str) -> Result<OperatorRow> {
    console::find_operator(pool, user_id)
        .await
        .map_err(|error| AppError::Internal(anyhow::anyhow!(error)))?
        .ok_or(AppError::ConsoleForbidden)
}
