"""The AI service.

Owns every call to the model and nothing else: no database connection, no
storage credentials, no user JWT. Every side effect goes through the API's
internal endpoints. See docs/ai/service.md.

What is here is the shell everything else runs inside: the shared-key
check, the per-caller ceiling, the OWE1 layer that opens every request and
seals every response, and the OWE1 client that calls the API back. On top
of it sit the chat stream with its tool loop and the capture routes with
the extraction quality ladder. The tool catalog is served as well, because
the API validates against the same definitions the model is shown.

The two halves are deliberately unlike each other. The chat loop is given
eleven tools; the capture routes are given none at all, because they are
the ones that read text somebody else wrote (D24, SEC-21).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware import Middleware

from app.api.routes import chat, extraction, handshake, tools
from app.config import Settings, settings
from app.core.envelope import error_response
from app.core.middleware import Owe1Middleware, RateLimitMiddleware, ServiceKeyMiddleware
from app.core.owe1_client import build_api_client
from app.core.ratelimit import RateLimiter
from app.core.sessions import SessionStore, now_secs
from app.core.signer import Signer

logger = logging.getLogger("oewang.ai")

SWEEP_INTERVAL_SECS = 10 * 60


async def _sweep_sessions(store: SessionStore) -> None:
    """Expired sessions are dropped on read, so this only keeps memory
    tracking live sessions rather than every session ever opened."""
    while True:
        await asyncio.sleep(SWEEP_INTERVAL_SECS)
        dropped = store.sweep(now_secs())
        if dropped:
            logger.info("swept %d expired crypto sessions", dropped)


@contextlib.asynccontextmanager
async def lifespan(instance: FastAPI) -> AsyncIterator[None]:
    task = asyncio.create_task(_sweep_sessions(instance.state.owe1_sessions))
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        await instance.state.api.aclose()


def create_app(config: Settings | None = None) -> FastAPI:
    """Build the service. A factory rather than a module-level app, so a
    test can run the real middleware stack against its own settings."""
    config = config or settings
    config.validate_for_environment()

    sessions = SessionStore()
    # Created on first start in development; mounted from the secret store
    # anywhere else (D22).
    signer = Signer.load_or_create(
        config.crypto_signing_key_file,
        allow_create=config.app_env == "development",
    )

    instance = FastAPI(
        title="oewang-ai",
        version="0.1.0",
        lifespan=lifespan,
        # Outermost first: a caller without the shared key never reaches the
        # rate limiter, and neither of them needs a crypto session.
        middleware=[
            Middleware(ServiceKeyMiddleware, api_key=config.ai_service_api_key),
            Middleware(
                RateLimitMiddleware,
                limiter=RateLimiter(config.rate_limit_per_minute),
                handshake_limiter=RateLimiter(config.handshake_rate_limit_per_minute),
            ),
            Middleware(Owe1Middleware, store=sessions, enabled=config.owe1_enabled),
        ],
    )

    instance.state.owe1_sessions = sessions
    instance.state.signer = signer
    instance.state.config = config
    # The other direction of the same protocol: this service calling the
    # API, which is how it performs every side effect (D4, D22). One client
    # for the process, holding one crypto session.
    instance.state.api = build_api_client(config)

    instance.include_router(handshake.router)
    instance.include_router(chat.router)
    instance.include_router(extraction.router)
    instance.include_router(tools.router)

    @instance.exception_handler(RequestValidationError)
    async def on_invalid_body(request: Request, error: RequestValidationError) -> JSONResponse:
        """A refused body, in this service's envelope.

        Two reasons this replaces FastAPI's own handler rather than
        sitting beside it. The first is that one client parses both
        services, so a refusal here has to look like a refusal from the
        API (docs/api/conventions.md).

        The second is OPS-3. FastAPI's default body echoes the offending
        `input` back, and on `POST /receipt/parse` the offending input is
        a base64 receipt: a validation error would hand a document's
        bytes to whatever logged the response. Only the location and the
        reason are returned here, never the value.
        """
        fields = {
            ".".join(str(part) for part in item.get("loc", ())[1:]): item.get("msg", "")
            for item in error.errors()
        }
        code = (
            "UNSUPPORTED_MEDIA_TYPE"
            if any(name.endswith("media_type") for name in fields)
            else "VALIDATION_FAILED"
        )
        return error_response(
            code,
            "the request body was refused",
            request.headers.get("x-owe-request-id", ""),
            fields=fields,
        )

    @instance.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return instance


app = create_app()

__all__ = ["app", "create_app", "settings"]
