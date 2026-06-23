import hmac

from fastapi import Header, HTTPException

from app.config import get_settings


async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    expected = get_settings().AI_SERVICE_API_KEY
    # ponytail: no key configured -> auth disabled (dev). Set AI_SERVICE_API_KEY to enforce.
    if not expected:
        return
    if not x_api_key or not hmac.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="invalid api key")
