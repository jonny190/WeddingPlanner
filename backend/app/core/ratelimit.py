"""A small in-process rate limiter for the endpoints anyone on the internet can reach.

Counts live in memory, so each API process keeps its own tally: with ``WEB_CONCURRENCY=2``
a client can make up to twice the configured number of requests before being refused.
That is deliberate. The aim is to blunt password guessing and bulk abuse, not to meter
usage precisely, and it needs no extra infrastructure. A proxy-level limit can be added
on top for a busier deployment.
"""

import threading
import time
from collections import deque
from collections.abc import Callable

from fastapi import Depends, Request

from app.core.errors import TooManyRequests


class RateLimiter:
    """Sliding-window counters keyed by (bucket, client)."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._hits: dict[tuple[str, str], deque[float]] = {}
        self._last_sweep = clock()

    def check(self, bucket: str, key: str, limit: int, window_seconds: float) -> None:
        """Record one request and raise ``TooManyRequests`` if the window is already full."""
        if limit <= 0:
            return
        now = self._clock()
        with self._lock:
            self._sweep(now, window_seconds)
            hits = self._hits.setdefault((bucket, key), deque())
            while hits and hits[0] <= now - window_seconds:
                hits.popleft()
            if len(hits) >= limit:
                retry_after = int(hits[0] + window_seconds - now) + 1
                raise TooManyRequests(retry_after=retry_after)
            hits.append(now)

    def _sweep(self, now: float, window_seconds: float) -> None:
        """Drop idle clients now and then so the table cannot grow without bound."""
        if now - self._last_sweep < 60:
            return
        self._last_sweep = now
        for key, hits in list(self._hits.items()):
            if not hits or hits[-1] <= now - max(window_seconds, 3600):
                del self._hits[key]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def client_ip(request: Request) -> str:
    # uvicorn runs with --proxy-headers, so behind nginx this is the real client address.
    return request.client.host if request.client else "unknown"


def _limiter(request: Request) -> RateLimiter:
    return request.app.state.rate_limiter


def per_client(bucket: str, limit_setting: str, window_seconds: float):
    """A dependency that limits requests to ``bucket`` per client IP.

    ``limit_setting`` names the ``Settings`` field holding the number allowed per window.
    """

    def dependency(request: Request) -> None:
        limit = getattr(request.app.state.settings, limit_setting)
        _limiter(request).check(bucket, client_ip(request), limit, window_seconds)

    return Depends(dependency)


def check_per_user(
    request: Request, bucket: str, user_id: object, limit_setting: str, window_seconds: float
) -> None:
    """Limit requests to ``bucket`` for one signed-in user. Called from handlers that already
    know who is acting."""
    limit = getattr(request.app.state.settings, limit_setting)
    _limiter(request).check(bucket, str(user_id), limit, window_seconds)


AuthAttempt = per_client("auth", "rate_limit_auth_per_minute", 60)
PublicRequest = per_client("public", "rate_limit_public_per_minute", 60)
