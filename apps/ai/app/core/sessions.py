"""Crypto sessions, held in process memory.

The same rules as the Rust store at
apps/api/crates/server/src/owe1/session.rs: at most 24 hours or 2^24
messages per direction, a 120 second skew tolerance, and request ids
remembered for five minutes so a replay inside the freshness window is still
caught. A restart drops every session; the client answers
CRYPTO_SESSION_UNKNOWN by running one new handshake and retrying once.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from enum import Enum

from app.core.owe1 import SessionKeys

SESSION_TTL_SECS = 24 * 60 * 60
MAX_MESSAGES_PER_DIRECTION = 1 << 24
CLOCK_SKEW_TOLERANCE_SECS = 120
REPLAY_WINDOW_SECS = 5 * 60


class SeenOutcome(Enum):
    FRESH = "fresh"
    REPLAY = "replay"


@dataclass
class Session:
    keys: SessionKeys
    expires_at: int
    messages: int = 0
    #: Request ids seen inside the replay window, with when they were seen.
    seen: dict[str, int] = field(default_factory=dict)

    def observe(self, request_id: str, now: int) -> SeenOutcome:
        """Record a request id, reporting whether it had already been used.

        Freshness comes from the timestamp, not from the id: a CUID2 carries
        no time, so the id alone cannot say how old a request is.
        """
        cutoff = now - REPLAY_WINDOW_SECS
        self.seen = {key: at for key, at in self.seen.items() if at >= cutoff}

        if request_id in self.seen:
            return SeenOutcome.REPLAY

        self.seen[request_id] = now
        self.messages += 1
        return SeenOutcome.FRESH


class SessionStore:
    """Sessions live as long as the process. Sync endpoints run in a thread
    pool, so the map is guarded rather than left to the event loop."""

    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()

    def insert(self, session_id: str, keys: SessionKeys, expires_at: int) -> None:
        with self._lock:
            self._sessions[session_id] = Session(keys=keys, expires_at=expires_at)

    def keys(self, session_id: str, now: int) -> SessionKeys | None:
        """Fetch a live session's keys, dropping it if it has expired or run
        out of message budget."""
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            if session.expires_at <= now or session.messages >= MAX_MESSAGES_PER_DIRECTION:
                del self._sessions[session_id]
                return None
            return session.keys

    def observe(self, session_id: str, request_id: str, now: int) -> SeenOutcome | None:
        with self._lock:
            session = self._sessions.get(session_id)
            return None if session is None else session.observe(request_id, now)

    def sweep(self, now: int) -> int:
        """Drop expired sessions, so memory tracks live sessions rather than
        every session ever opened."""
        with self._lock:
            before = len(self._sessions)
            self._sessions = {
                key: session
                for key, session in self._sessions.items()
                if session.expires_at > now and session.messages < MAX_MESSAGES_PER_DIRECTION
            }
            return before - len(self._sessions)

    def expires_at(self, session_id: str) -> int | None:
        with self._lock:
            session = self._sessions.get(session_id)
            return None if session is None else session.expires_at

    def __len__(self) -> int:
        with self._lock:
            return len(self._sessions)


def now_secs() -> int:
    return int(time.time())


def timestamp_acceptable(client: int, server: int) -> bool:
    """Is a client timestamp inside the accepted window?"""
    return abs(client - server) <= CLOCK_SKEW_TOLERANCE_SECS
