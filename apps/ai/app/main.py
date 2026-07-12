from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.api.middleware.auth import require_api_key
from app.api.routes import advisor, analyzer, anomaly, capabilities, chatbot
from app.config import get_settings
from app.core.database import close_pool
from app.core.quota import PlanLimitReached
from app.modules.anomaly.service import scan_all_workspaces
from app.utils.logger import get_logger

log = get_logger("main")

# ponytail: in-memory rate limit + scheduler — fine for one replica.
# Move to Redis storage / APScheduler jobstore if you run multiple instances.
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])
scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(_: FastAPI):
    hours = get_settings().ANOMALY_SCAN_HOURS
    if hours > 0:
        scheduler.add_job(scan_all_workspaces, "interval", hours=hours)
        scheduler.start()
        log.info("anomaly scan scheduled every %sh", hours)
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)
    await close_pool()


app = FastAPI(title="oewang AI", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(PlanLimitReached)
async def _plan_limit_handler(_: Request, exc: PlanLimitReached) -> JSONResponse:
    # 422 mirrors the TS quota error so the browser sees the same shape.
    return JSONResponse(
        status_code=422,
        content={"error": "PLAN_LIMIT_REACHED", "meta": {"reset_at": exc.reset_at}},
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


_auth = [Depends(require_api_key)]
app.include_router(chatbot.router, dependencies=_auth)
app.include_router(analyzer.router, dependencies=_auth)
app.include_router(advisor.router, dependencies=_auth)
app.include_router(anomaly.router, dependencies=_auth)
app.include_router(capabilities.router, dependencies=_auth)
