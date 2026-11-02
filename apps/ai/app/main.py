"""The AI service.

Owns every call to the model and nothing else: no database connection, no
storage credentials, no user JWT. Every side effect goes through the API's
internal endpoints. See docs/ai/service.md.

Scaffold only. The API key middleware, the tool loop and the extraction
ladder arrive in US-026 and US-033b.
"""

from fastapi import FastAPI

from app.config import settings

app = FastAPI(title="oewang-ai", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


__all__ = ["app", "settings"]
