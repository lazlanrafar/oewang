//! What every handler can reach.

use std::sync::Arc;

use oewang_db::PgPool;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    // Held for handlers that arrive with their features (US-008 onward).
    #[allow(dead_code)]
    pub config: Arc<Config>,
}
