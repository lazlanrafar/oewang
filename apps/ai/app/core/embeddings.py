from openai import OpenAI

from app.config import get_settings

_client: OpenAI | None = None


def _get() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=get_settings().OPENAI_API_KEY or None)
    return _client


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
