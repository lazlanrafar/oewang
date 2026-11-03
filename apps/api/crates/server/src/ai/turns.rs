//! What one chat turn has already spent, and what it has been challenged on.
//!
//! Two pieces of short-lived state that exist for the same reason: a cap
//! only bounds anything if something remembers what has happened so far
//! (D25, docs/security/ai-safety.md#layer-2-blast-radius).
//!
//! In process memory, like the crypto sessions. Both are measured in
//! minutes, both are worthless after a restart in a way that fails closed
//! (an unknown turn is refused, an unknown challenge is re-issued), and a
//! shared store is only needed when the API runs on more than one instance,
//! which is a later change with its own decision record.

use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};

use oewang_domain::{
    tools::{
        Tool, CONFIRMATION_TTL_SECS, MAX_CREATED_TRANSACTIONS_PER_TURN, MAX_DELETES_PER_TURN,
        MAX_WRITES_PER_TURN,
    },
    AppError, Result,
};

/// How long a turn may keep spending its budget.
///
/// Longer than any turn should take and shorter than a conversation, so a
/// turn id cannot be kept alive and drawn against later.
pub const TURN_TTL_SECS: i64 = 10 * 60;

#[derive(Debug, Default)]
struct Counters {
    opened_at: i64,
    writes: u32,
    deletes: u32,
    created: u32,
}

#[derive(Default)]
struct Inner {
    turns: HashMap<String, Counters>,
    /// Keyed by session and transaction together, so a confirmation cannot
    /// be carried from one row to another (CHAT-6).
    challenges: HashMap<(String, String), i64>,
}

#[derive(Clone, Default)]
pub struct TurnStore {
    inner: Arc<RwLock<Inner>>,
}

impl TurnStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Open a turn's budget. Called by the API when it mints the turn id,
    /// which is the only way one comes into existence.
    pub fn open(&self, turn_id: &str, now: i64) {
        let mut guard = self.inner.write().expect("turn store poisoned");
        guard.turns.insert(
            turn_id.to_string(),
            Counters {
                opened_at: now,
                ..Counters::default()
            },
        );
    }

    /// Count one tool call against the turn, refusing it if a cap is
    /// reached.
    ///
    /// Counted on the attempt rather than on success. A write that fails
    /// still asked for one, and the budget is a bound on what a turn may
    /// try, not on what it happened to achieve.
    ///
    /// A turn id the API did not mint, or one that has expired, is refused
    /// outright: it is the only way a caller could reset a counter.
    pub fn reserve(&self, turn_id: &str, tool: Tool, now: i64) -> Result<()> {
        if !tool.is_write() {
            return Ok(());
        }

        let mut guard = self.inner.write().expect("turn store poisoned");

        let Some(counters) = guard.turns.get_mut(turn_id) else {
            return Err(AppError::ToolForbidden);
        };

        if now - counters.opened_at > TURN_TTL_SECS {
            guard.turns.remove(turn_id);
            return Err(AppError::ToolForbidden);
        }

        let would_delete = counters.deletes + u32::from(tool.is_delete());
        let would_create = counters.created + u32::from(tool.creates_transaction());

        if counters.writes + 1 > MAX_WRITES_PER_TURN
            || would_delete > MAX_DELETES_PER_TURN
            || would_create > MAX_CREATED_TRANSACTIONS_PER_TURN
        {
            return Err(AppError::ToolCapExceeded);
        }

        counters.writes += 1;
        counters.deletes = would_delete;
        counters.created = would_create;

        Ok(())
    }

    /// Record that this exact row has been put to the user.
    pub fn challenge(&self, session_id: &str, transaction_id: &str, now: i64) {
        let mut guard = self.inner.write().expect("turn store poisoned");
        guard
            .challenges
            .insert((session_id.to_string(), transaction_id.to_string()), now);
    }

    /// Has this exact row been challenged recently enough to be confirmed?
    pub fn challenged(&self, session_id: &str, transaction_id: &str, now: i64) -> bool {
        let guard = self.inner.read().expect("turn store poisoned");

        guard
            .challenges
            .get(&(session_id.to_string(), transaction_id.to_string()))
            .is_some_and(|issued_at| now - issued_at <= CONFIRMATION_TTL_SECS)
    }

    /// Spend the challenge. One confirmation answers one delete; a second
    /// delete of anything is challenged again.
    pub fn clear_challenge(&self, session_id: &str, transaction_id: &str) {
        let mut guard = self.inner.write().expect("turn store poisoned");
        guard
            .challenges
            .remove(&(session_id.to_string(), transaction_id.to_string()));
    }

    /// Drop what has aged out, so memory tracks live turns rather than
    /// every turn ever taken.
    pub fn sweep(&self, now: i64) -> usize {
        let mut guard = self.inner.write().expect("turn store poisoned");
        let before = guard.turns.len() + guard.challenges.len();

        guard
            .turns
            .retain(|_, counters| now - counters.opened_at <= TURN_TTL_SECS);
        guard
            .challenges
            .retain(|_, issued_at| now - *issued_at <= CONFIRMATION_TTL_SECS);

        before - (guard.turns.len() + guard.challenges.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TURN: &str = "turn_1";
    const SESSION: &str = "ses_1";

    fn store() -> TurnStore {
        let store = TurnStore::new();
        store.open(TURN, 0);
        store
    }

    #[test]
    fn should_not_charge_a_read_against_the_budget() {
        let store = store();
        for _ in 0..20 {
            store.reserve(TURN, Tool::SearchTransactions, 0).unwrap();
        }
        // The writes are still all there.
        store.reserve(TURN, Tool::CreateWallet, 0).unwrap();
    }

    #[test]
    fn should_refuse_the_fourth_write_in_one_turn() {
        let store = store();
        for _ in 0..MAX_WRITES_PER_TURN {
            store.reserve(TURN, Tool::CreateWallet, 0).unwrap();
        }
        let error = store.reserve(TURN, Tool::CreateWallet, 0).unwrap_err();
        assert_eq!(error.code(), "TOOL_CAP_EXCEEDED");
    }

    #[test]
    fn should_refuse_a_second_delete_in_one_turn() {
        let store = store();
        store.reserve(TURN, Tool::DeleteTransaction, 0).unwrap();
        let error = store.reserve(TURN, Tool::DeleteTransaction, 0).unwrap_err();
        assert_eq!(error.code(), "TOOL_CAP_EXCEEDED");
    }

    #[test]
    fn should_refuse_the_fourth_created_transaction() {
        let store = store();
        for _ in 0..MAX_CREATED_TRANSACTIONS_PER_TURN {
            store.reserve(TURN, Tool::CreateTransaction, 0).unwrap();
        }
        let error = store.reserve(TURN, Tool::CreateTransaction, 0).unwrap_err();
        assert_eq!(error.code(), "TOOL_CAP_EXCEEDED");
    }

    #[test]
    fn should_not_let_a_refused_call_consume_the_budget_twice() {
        let store = store();
        for _ in 0..MAX_WRITES_PER_TURN {
            store.reserve(TURN, Tool::CreateWallet, 0).unwrap();
        }
        assert!(store.reserve(TURN, Tool::CreateWallet, 0).is_err());
        assert!(store.reserve(TURN, Tool::CreateWallet, 0).is_err());
    }

    #[test]
    fn should_refuse_a_turn_the_api_never_opened() {
        let store = TurnStore::new();
        let error = store
            .reserve("turn_invented", Tool::CreateTransaction, 0)
            .unwrap_err();
        assert_eq!(error.code(), "TOOL_FORBIDDEN");
    }

    #[test]
    fn should_refuse_an_expired_turn() {
        let store = store();
        let error = store
            .reserve(TURN, Tool::CreateTransaction, TURN_TTL_SECS + 1)
            .unwrap_err();
        assert_eq!(error.code(), "TOOL_FORBIDDEN");
    }

    #[test]
    fn should_give_each_turn_its_own_budget() {
        let store = store();
        store.open("turn_2", 0);

        for _ in 0..MAX_WRITES_PER_TURN {
            store.reserve(TURN, Tool::CreateWallet, 0).unwrap();
        }
        store.reserve("turn_2", Tool::CreateWallet, 0).unwrap();
    }

    #[test]
    fn should_answer_a_challenge_only_for_the_row_it_was_issued_for() {
        let store = store();
        store.challenge(SESSION, "txn_a", 0);

        assert!(store.challenged(SESSION, "txn_a", 0));
        assert!(
            !store.challenged(SESSION, "txn_b", 0),
            "a confirmation does not transfer"
        );
        assert!(
            !store.challenged("ses_other", "txn_a", 0),
            "nor does it cross sessions"
        );
    }

    #[test]
    fn should_expire_a_challenge() {
        let store = store();
        store.challenge(SESSION, "txn_a", 0);

        assert!(store.challenged(SESSION, "txn_a", CONFIRMATION_TTL_SECS));
        assert!(!store.challenged(SESSION, "txn_a", CONFIRMATION_TTL_SECS + 1));
    }

    #[test]
    fn should_spend_a_challenge_when_it_is_answered() {
        let store = store();
        store.challenge(SESSION, "txn_a", 0);
        store.clear_challenge(SESSION, "txn_a");
        assert!(!store.challenged(SESSION, "txn_a", 0));
    }

    #[test]
    fn should_sweep_only_what_has_aged_out() {
        let store = TurnStore::new();
        store.open("turn_old", 0);
        store.open("turn_new", 1_000);
        store.challenge(SESSION, "txn_a", 0);
        store.challenge(SESSION, "txn_b", 1_000);

        assert_eq!(store.sweep(1_000), 2);
        assert!(store.reserve("turn_new", Tool::CreateWallet, 1_000).is_ok());
        assert!(store.challenged(SESSION, "txn_b", 1_000));
    }
}
