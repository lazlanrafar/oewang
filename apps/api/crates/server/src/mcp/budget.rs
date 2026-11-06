//! What an MCP token has spent this minute, and what it has been challenged
//! on (D106).
//!
//! The chat's caps rest on a turn the API mints (D68); an MCP client has no
//! turns, so the API mints the window instead: one rolling minute per token.
//! The client cannot reset it, because it is keyed by the token the API
//! looked up, not by anything the client sends.
//!
//! In process memory, like `ai::turns`, and for the same reasons: minutes
//! long, worthless after a restart in a way that fails closed (a lost
//! challenge is asked again), single instance (D75).

use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};

use oewang_domain::{tools::CONFIRMATION_TTL_SECS, AppError, Result};

/// Calls of any kind one token may make in a minute.
pub const MAX_CALLS_PER_MINUTE: u32 = 120;
/// Writes, deletes included.
pub const MAX_WRITES_PER_MINUTE: u32 = 30;
pub const MAX_DELETES_PER_MINUTE: u32 = 5;

const WINDOW_SECS: i64 = 60;

/// How a tool spends the budget.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Spend {
    Read,
    Write,
    Delete,
}

#[derive(Debug, Default)]
struct Window {
    started_at: i64,
    calls: u32,
    writes: u32,
    deletes: u32,
}

#[derive(Default)]
struct Inner {
    windows: HashMap<String, Window>,
    /// Keyed by token and the exact call, so a confirmation answers that
    /// call and no other (CHAT-6's rule, for every delete).
    challenges: HashMap<(String, String), i64>,
}

#[derive(Clone, Default)]
pub struct McpBudget {
    inner: Arc<RwLock<Inner>>,
}

impl McpBudget {
    pub fn new() -> Self {
        Self::default()
    }

    /// Count one call, refusing it past a cap. Counted on the attempt, as
    /// the chat's caps are.
    pub fn spend(&self, token_id: &str, spend: Spend, now: i64) -> Result<()> {
        let mut guard = self.inner.write().expect("mcp budget poisoned");
        let window = guard
            .windows
            .entry(token_id.to_string())
            .or_insert_with(|| Window {
                started_at: now,
                ..Window::default()
            });
        if now - window.started_at >= WINDOW_SECS {
            *window = Window {
                started_at: now,
                ..Window::default()
            };
        }

        let writes = window.writes + u32::from(spend != Spend::Read);
        let deletes = window.deletes + u32::from(spend == Spend::Delete);
        if window.calls + 1 > MAX_CALLS_PER_MINUTE {
            let retry = (WINDOW_SECS - (now - window.started_at)).max(1) as u64;
            return Err(AppError::RateLimited {
                retry_after_secs: retry,
            });
        }
        if writes > MAX_WRITES_PER_MINUTE || deletes > MAX_DELETES_PER_MINUTE {
            return Err(AppError::ToolCapExceeded);
        }

        window.calls += 1;
        window.writes = writes;
        window.deletes = deletes;
        Ok(())
    }

    pub fn challenge(&self, token_id: &str, call: &str, now: i64) {
        let mut guard = self.inner.write().expect("mcp budget poisoned");
        guard
            .challenges
            .insert((token_id.to_string(), call.to_string()), now);
    }

    /// Spend a live challenge for exactly this call. True once.
    pub fn take_challenge(&self, token_id: &str, call: &str, now: i64) -> bool {
        let mut guard = self.inner.write().expect("mcp budget poisoned");
        match guard
            .challenges
            .remove(&(token_id.to_string(), call.to_string()))
        {
            Some(issued_at) => now - issued_at <= CONFIRMATION_TTL_SECS,
            None => false,
        }
    }

    pub fn sweep(&self, now: i64) {
        let mut guard = self.inner.write().expect("mcp budget poisoned");
        guard
            .windows
            .retain(|_, window| now - window.started_at < WINDOW_SECS);
        guard
            .challenges
            .retain(|_, issued_at| now - *issued_at <= CONFIRMATION_TTL_SECS);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_cap_writes_and_deletes_per_minute_per_token() {
        let budget = McpBudget::new();
        for _ in 0..MAX_DELETES_PER_MINUTE {
            budget.spend("t", Spend::Delete, 0).unwrap();
        }
        assert!(matches!(
            budget.spend("t", Spend::Delete, 1),
            Err(AppError::ToolCapExceeded)
        ));
        // Another token has its own minute; this one gets a new one later.
        budget.spend("u", Spend::Delete, 1).unwrap();
        budget.spend("t", Spend::Delete, 60).unwrap();
    }

    #[test]
    fn should_answer_a_challenge_once_for_the_exact_call() {
        let budget = McpBudget::new();
        budget.challenge("t", "delete_wallet {\"id\":\"w1\"}", 0);
        assert!(!budget.take_challenge("t", "delete_wallet {\"id\":\"w2\"}", 1));
        assert!(!budget.take_challenge("u", "delete_wallet {\"id\":\"w1\"}", 1));
        assert!(budget.take_challenge("t", "delete_wallet {\"id\":\"w1\"}", 1));
        assert!(!budget.take_challenge("t", "delete_wallet {\"id\":\"w1\"}", 2));
    }
}
