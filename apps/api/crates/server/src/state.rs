//! What every handler can reach.

use std::sync::Arc;

use oewang_clients::{FileStore, Mailer, Owe1Client, RatesClient};
use oewang_db::PgPool;

use crate::{
    ai::turns::TurnStore,
    config::Config,
    limits::RateLimiter,
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
    /// Where file bytes live. Local in development, S3 in production (D19).
    pub files: FileStore,
    /// The AI service, over OWE1 (hop 3). Built at startup, so a missing
    /// pinned key fails there rather than on the first chat turn.
    pub ai: Arc<Owe1Client>,
    /// What each live chat turn has already spent, and which deletes have
    /// been challenged. The per-turn caps are only a bound because this
    /// remembers (D25).
    pub turns: TurnStore,
    /// What each MCP token has spent this minute, and its open delete
    /// challenges (D106).
    pub mcp: crate::mcp::budget::McpBudget,
    /// Every per-address and per-workspace budget (OPS-5, AUTH-6, SEC-17).
    pub rate_limits: RateLimiter,
    /// The Telegram bot, when one is configured (D84).
    pub telegram: Option<crate::telegram::Bot>,
}
