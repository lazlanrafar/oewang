//! Crypto sessions, held in process memory.
//!
//! The reading side (key lookup, replay detection, the skew check) is
//! consumed by the OWE1 middleware in US-005. It is written and tested now
//! because the protocol contract is easier to get right in one piece than in
//! two, and the tests here are what prove it.
//!
//! A session lasts at most 24 hours or 2^24 messages per direction. A restart
//! drops them all; clients answer CRYPTO_SESSION_UNKNOWN by running one new
//! handshake and retrying once. A shared store is only needed when the API
//! runs on more than one instance, and that is a later change with its own
//! decision record.

#![allow(dead_code)] // Consumed by the middleware in US-005.

use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use oewang_domain::owe1::SessionKeys;

pub const SESSION_TTL: Duration = Duration::from_secs(24 * 60 * 60);
pub const MAX_MESSAGES_PER_DIRECTION: u64 = 1 << 24;
/// A request timestamp must be within this of server time, in either
/// direction (docs/api/encryption.md#replay-protection).
pub const CLOCK_SKEW_TOLERANCE_SECS: i64 = 120;
/// How long a request id is remembered for replay detection.
pub const REPLAY_WINDOW: Duration = Duration::from_secs(5 * 60);

pub struct Session {
    pub keys: SessionKeys,
    pub expires_at: i64,
    pub messages: u64,
    /// Request ids seen inside the replay window, with when they were seen.
    seen: HashMap<String, i64>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum SeenOutcome {
    Fresh,
    Replay,
}

impl Session {
    fn new(keys: SessionKeys, expires_at: i64) -> Self {
        Self { keys, expires_at, messages: 0, seen: HashMap::new() }
    }

    /// Record a request id, reporting whether it had already been used.
    ///
    /// Freshness comes from the timestamp, not from the id: a CUID2 carries
    /// no time, so the id alone cannot say how old a request is.
    fn observe(&mut self, request_id: &str, now: i64) -> SeenOutcome {
        let cutoff = now - REPLAY_WINDOW.as_secs() as i64;
        self.seen.retain(|_, seen_at| *seen_at >= cutoff);

        if self.seen.contains_key(request_id) {
            return SeenOutcome::Replay;
        }

        self.seen.insert(request_id.to_string(), now);
        self.messages += 1;
        SeenOutcome::Fresh
    }
}

#[derive(Clone, Default)]
pub struct SessionStore {
    inner: Arc<RwLock<HashMap<String, Session>>>,
}

impl SessionStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&self, session_id: String, keys: SessionKeys, expires_at: i64) {
        let mut guard = self.inner.write().expect("session store poisoned");
        guard.insert(session_id, Session::new(keys, expires_at));
    }

    /// Fetch a live session's keys, dropping it if it has expired or run out
    /// of message budget.
    pub fn keys(&self, session_id: &str, now: i64) -> Option<SessionKeys> {
        let mut guard = self.inner.write().expect("session store poisoned");
        let session = guard.get(session_id)?;

        if session.expires_at <= now || session.messages >= MAX_MESSAGES_PER_DIRECTION {
            guard.remove(session_id);
            return None;
        }

        Some(session.keys.clone())
    }

    pub fn observe(&self, session_id: &str, request_id: &str, now: i64) -> Option<SeenOutcome> {
        let mut guard = self.inner.write().expect("session store poisoned");
        guard.get_mut(session_id).map(|s| s.observe(request_id, now))
    }

    /// Drop expired sessions. Called periodically so memory tracks live
    /// sessions rather than every session ever opened.
    pub fn sweep(&self, now: i64) -> usize {
        let mut guard = self.inner.write().expect("session store poisoned");
        let before = guard.len();
        guard.retain(|_, s| s.expires_at > now && s.messages < MAX_MESSAGES_PER_DIRECTION);
        before - guard.len()
    }

    pub fn len(&self) -> usize {
        self.inner.read().expect("session store poisoned").len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

pub fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Is a client timestamp inside the accepted window?
pub fn timestamp_acceptable(client: i64, server: i64) -> bool {
    (client - server).abs() <= CLOCK_SKEW_TOLERANCE_SECS
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys() -> SessionKeys {
        SessionKeys { client_to_server: [1u8; 32], server_to_client: [2u8; 32] }
    }

    #[test]
    fn should_return_keys_for_a_live_session() {
        let store = SessionStore::new();
        store.insert("cs_a".into(), keys(), 1_000);
        assert!(store.keys("cs_a", 500).is_some());
    }

    #[test]
    fn should_drop_an_expired_session() {
        let store = SessionStore::new();
        store.insert("cs_a".into(), keys(), 1_000);
        assert!(store.keys("cs_a", 1_000).is_none(), "expiry is inclusive");
        assert!(store.is_empty(), "an expired session is removed, not just hidden");
    }

    #[test]
    fn should_not_know_an_unknown_session() {
        assert!(SessionStore::new().keys("cs_missing", 0).is_none());
    }

    #[test]
    fn should_detect_a_replayed_request_id() {
        let store = SessionStore::new();
        store.insert("cs_a".into(), keys(), i64::MAX);

        assert_eq!(store.observe("cs_a", "req_1", 100), Some(SeenOutcome::Fresh));
        assert_eq!(store.observe("cs_a", "req_1", 101), Some(SeenOutcome::Replay));
        assert_eq!(store.observe("cs_a", "req_2", 101), Some(SeenOutcome::Fresh));
    }

    #[test]
    fn should_forget_request_ids_outside_the_window() {
        let store = SessionStore::new();
        store.insert("cs_a".into(), keys(), i64::MAX);

        store.observe("cs_a", "req_1", 100);
        // Well past the five minute window: the id is no longer remembered.
        // Freshness is the timestamp's job, and that check happens before this.
        let later = 100 + REPLAY_WINDOW.as_secs() as i64 + 1;
        assert_eq!(store.observe("cs_a", "req_1", later), Some(SeenOutcome::Fresh));
    }

    #[test]
    fn should_retire_a_session_that_exhausts_its_message_budget() {
        let store = SessionStore::new();
        store.insert("cs_a".into(), keys(), i64::MAX);
        {
            let mut guard = store.inner.write().unwrap();
            guard.get_mut("cs_a").unwrap().messages = MAX_MESSAGES_PER_DIRECTION;
        }
        assert!(store.keys("cs_a", 0).is_none());
    }

    #[test]
    fn should_sweep_only_expired_sessions() {
        let store = SessionStore::new();
        store.insert("cs_live".into(), keys(), 1_000);
        store.insert("cs_dead".into(), keys(), 10);

        assert_eq!(store.sweep(100), 1);
        assert_eq!(store.len(), 1);
        assert!(store.keys("cs_live", 100).is_some());
    }

    #[test]
    fn should_accept_timestamps_inside_the_tolerance() {
        assert!(timestamp_acceptable(1000, 1000));
        assert!(timestamp_acceptable(1000 + 120, 1000));
        assert!(timestamp_acceptable(1000 - 120, 1000));
    }

    #[test]
    fn should_reject_timestamps_outside_the_tolerance() {
        assert!(!timestamp_acceptable(1000 + 121, 1000));
        assert!(!timestamp_acceptable(1000 - 121, 1000));
    }
}
