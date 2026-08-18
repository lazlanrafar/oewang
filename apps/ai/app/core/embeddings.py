from openai import OpenAI

from app.config import get_settings
from app.core.llm import get_client


def _get() -> OpenAI:
    # Reuse the single shared client (configured with timeout + retries).
    return get_client()


def embed(texts: list[str]) -> list[list[float]]:
    """Embed texts -> 1536-dim vectors (text-embedding-3-small), batched by 100."""
    model = get_settings().AI_EMBED_MODEL
    out: list[list[float]] = []
    for i in range(0, len(texts), 100):  # ponytail: OpenAI allows 2048/req; 100 is plenty
        resp = _get().embeddings.create(model=model, input=texts[i : i + 100])
        out.extend(d.embedding for d in resp.data)
    return out


def embed_one(text: str) -> list[float]:
    return embed([text])[0]
