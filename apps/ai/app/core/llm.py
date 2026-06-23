import asyncio
import json
from collections.abc import Awaitable, Callable

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


# execute_tool(name, args) -> {"result": any, "artifact": {type, payload} | None}
ToolExecutor = Callable[[str, dict], Awaitable[dict]]


async def complete_with_tools(
    system: str,
    messages: list[dict],
    tools: list[dict],
    execute_tool: ToolExecutor,
    max_steps: int = 10,
) -> dict:
    """Multi-step tool-calling loop (mirrors the TS orchestrator).

    Runs the OpenAI tool loop, forwarding each tool call to `execute_tool`.
    Accumulates token usage across steps and keeps the LAST artifact a tool
    returns (matches the orchestrator's onArtifact behavior). The sync OpenAI
    client is offloaded with asyncio.to_thread so tool I/O stays concurrent.
    """
    client = get_client()
    model = get_settings().AI_CHAT_MODEL
    convo: list[dict] = [{"role": "system", "content": system}, *messages]

    usage_in = 0
    usage_out = 0
    artifact: dict | None = None
    response_id: str | None = None
    reply = ""

    for step in range(max_steps):
        # On the final allowed step, stop offering tools so the model must
        # produce a text answer instead of another tool call we can't run.
        use_tools = step < max_steps - 1
        resp = await asyncio.to_thread(
            lambda ut=use_tools: client.chat.completions.create(
                model=model,
                messages=convo,
                **({"tools": tools, "tool_choice": "auto"} if ut else {}),
            )
        )
        if resp.usage:
            usage_in += resp.usage.prompt_tokens
            usage_out += resp.usage.completion_tokens
        response_id = resp.id

        msg = resp.choices[0].message
        tool_calls = msg.tool_calls
        if not tool_calls:
            reply = msg.content or ""
            break

        convo.append(msg.model_dump(exclude_none=True))
        for tc in tool_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            out = await execute_tool(tc.function.name, args)
            if out.get("artifact"):
                artifact = out["artifact"]
            convo.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(out.get("result")),
                }
            )

    return {
        "reply": reply,
        "usage": {"input_tokens": usage_in, "output_tokens": usage_out},
        "artifact": artifact,
        "response_id": response_id,
    }
