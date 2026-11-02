//! What every handler can reach.

use std::sync::Arc;

use oewang_clients::{Mailer, RatesClient};
use oewang_db::PgPool;

use crate::{
    config::Config,
    owe1::{Owe1Signer, SessionStore},
};

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    // Held for handlers that arrive with their features (US-008 onward).
    #[allow(dead_code)]
    pub config: Arc<Config>,
    pub owe1_signer: Arc<Owe1Signer>,
    pub owe1_sessions: SessionStore,
    pub mailer: Mailer,
    /// The daily rate source. Every lookup through it is allowed to fail;
    /// the resolution ladder has a step for that (TXN-22).
    pub rates: RatesClient,
}
