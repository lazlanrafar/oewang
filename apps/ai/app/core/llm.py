from openai import OpenAI

from app.config import get_settings

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=get_settings().OPENAI_API_KEY or None)
    return _client


def complete_raw(
    system: str,
    messages: list[dict],
    max_tokens: int = 1024,
) -> dict:
    """OpenAI chat completion returning reply + token usage + response id."""
    resp = get_client().chat.completions.create(
        model=get_settings().AI_CHAT_MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "system", "content": system}, *messages],
    )
    usage = resp.usage
    return {
        "reply": resp.choices[0].message.content or "",
        "usage": {
            "input_tokens": usage.prompt_tokens if usage else 0,
            "output_tokens": usage.completion_tokens if usage else 0,
        },
        "response_id": resp.id,
    }


def complete(
    system: str,
    messages: list[dict],
    max_tokens: int = 1024,
) -> str:
    """Just the reply text. messages are [{role, content}] (user/assistant)."""
    return complete_raw(system, messages, max_tokens)["reply"]
