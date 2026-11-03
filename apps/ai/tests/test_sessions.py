"""The crypto session store, with the same rules as the Rust one at
apps/api/crates/server/src/owe1/session.rs."""

from __future__ import annotations

from app.core.owe1 import SessionKeys
from app.core.sessions import (
    MAX_MESSAGES_PER_DIRECTION,
    REPLAY_WINDOW_SECS,
    SeenOutcome,
    SessionStore,
    timestamp_acceptable,
)


def keys() -> SessionKeys:
    return SessionKeys(client_to_server=bytes(32), server_to_client=bytes([1]) * 32)


def test_a_live_session_returns_its_keys() -> None:
    store = SessionStore()
    store.insert("cs_a", keys(), 1_000)
    assert store.keys("cs_a", 500) is not None


def test_an_expired_session_is_dropped() -> None:
    store = SessionStore()
    store.insert("cs_a", keys(), 1_000)
    assert store.keys("cs_a", 1_000) is None, "expiry is inclusive"
    assert len(store) == 0, "an expired session is removed, not just hidden"


def test_an_unknown_session_is_unknown() -> None:
    assert SessionStore().keys("cs_missing", 0) is None


def test_a_replayed_request_id_is_detected() -> None:
    store = SessionStore()
    store.insert("cs_a", keys(), 2**62)

    assert store.observe("cs_a", "req_1", 100) is SeenOutcome.FRESH
    assert store.observe("cs_a", "req_1", 101) is SeenOutcome.REPLAY
    assert store.observe("cs_a", "req_2", 101) is SeenOutcome.FRESH


def test_request_ids_outside_the_window_are_forgotten() -> None:
    """Freshness is the timestamp's job, and that check happens first."""
    store = SessionStore()
    store.insert("cs_a", keys(), 2**62)

    store.observe("cs_a", "req_1", 100)
    later = 100 + REPLAY_WINDOW_SECS + 1
    assert store.observe("cs_a", "req_1", later) is SeenOutcome.FRESH


def test_a_session_out_of_message_budget_is_retired() -> None:
    store = SessionStore()
    store.insert("cs_a", keys(), 2**62)
    store._sessions["cs_a"].messages = MAX_MESSAGES_PER_DIRECTION
    assert store.keys("cs_a", 0) is None


def test_the_sweep_drops_only_expired_sessions() -> None:
    store = SessionStore()
    store.insert("cs_live", keys(), 1_000)
    store.insert("cs_dead", keys(), 10)

    assert store.sweep(100) == 1
    assert len(store) == 1
    assert store.keys("cs_live", 100) is not None


def test_timestamps_inside_the_tolerance_are_accepted() -> None:
    assert timestamp_acceptable(1000, 1000)
    assert timestamp_acceptable(1120, 1000)
    assert timestamp_acceptable(880, 1000)


def test_timestamps_outside_the_tolerance_are_refused() -> None:
    assert not timestamp_acceptable(1121, 1000)
    assert not timestamp_acceptable(879, 1000)
