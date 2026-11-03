"""Per-caller rate limiting, in process memory.

One service calls this one, so the point is not fairness between tenants: it
is that a loop in the API, or a leaked key, cannot turn into an unbounded
spend on the model (SEC-1). A sliding window keeps a burst at the minute
boundary from passing twice the limit.
"""

from __future__ import annotations

import threading
import time
from collections import deque


class RateLimiter:
    def __init__(self, limit: int, window_secs: int = 60) -> None:
        self.limit = limit
        self.window_secs = window_secs
        self._calls: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, caller: str, now: float | None = None) -> bool:
        """Record a call and report whether it is within the limit."""
        if self.limit <= 0:
            return True

        moment = time.monotonic() if now is None else now
        cutoff = moment - self.window_secs

        with self._lock:
            window = self._calls.setdefault(caller, deque())
            while window and window[0] <= cutoff:
                window.popleft()

            if len(window) >= self.limit:
                return False

            window.append(moment)

            # A caller that has gone quiet leaves an empty deque behind.
            if len(self._calls) > 1024:
                self._calls = {k: v for k, v in self._calls.items() if v}

            return True

    def retry_after(self, caller: str, now: float | None = None) -> int:
        """Whole seconds until the oldest call in the window ages out."""
        moment = time.monotonic() if now is None else now
        with self._lock:
            window = self._calls.get(caller)
            if not window:
                return 1
            return max(1, int(window[0] + self.window_secs - moment) + 1)
