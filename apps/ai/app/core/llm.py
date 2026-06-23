from openai import OpenAI

from app.config import get_settings

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=get_settings().OPENAI_API_KEY or None)
    return _client


def complete(
    system: str,
    messages: list[dict],
    max_tokens: int = 1024,
) -> str:
    """One OpenAI chat completion. messages are [{role, content}] (user/assistant)."""
    resp = get_client().chat.completions.create(
        model=get_settings().AI_CHAT_MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "system", "content": system}, *messages],
    )
    return resp.choices[0].message.content or ""
