# LLM & Anthropic AI Engineering — Python Developer Reference

Sources: `anthropics/skills@claude-api` and production AI service patterns (`oewang/apps/ai`).

---

## 1. Non-Negotiable AI Architecture & Safety Rules

1. **AI Service Never Touches the Database Directly**:
   - The AI service holds no `DATABASE_URL` and no direct storage credentials. It reads context and performs side effects strictly by calling internal authenticated API endpoints on behalf of the principal.
2. **The Model Never Performs Arithmetic**:
   - Never trust an LLM to sum, round, convert currencies, or compute balances. Every number presented to the user must be computed, rounded (`Decimal`), and formatted by deterministic backend code or tool results.
3. **Untrusted Input Isolation (Prompt Injection Defense)**:
   - Any call that processes attacker-controlled text (uploaded PDFs, receipts, bank statements, inbound emails, scraped web pages) **must pass an empty tool list (`tools=[]`)** and output only to a strict schema. Never grant side-effect tools to a model context containing untrusted external documents.
4. **Zero Sensitive Data in Logs**:
   - Never log raw decrypted request/response bodies, API keys, user tokens, or uploaded document contents. Log only metadata (model, token usage counts, latency, `request_id`).

---

## 2. Prompt Caching (`cache_control`)

Use Anthropic prompt caching to cut input token costs by up to 90% and reduce time-to-first-token (TTFT) on repeated system prompts, tool definitions, and large static context blocks:

```python
import anthropic

client = anthropic.AsyncAnthropic()

async def run_cached_turn(system_instructions: str, messages: list[dict]) -> anthropic.types.Message:
    return await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        system=[
            {
                "type": "text",
                "text": system_instructions,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=messages,
    )
```

- Place static content (system instructions, tool definitions, few-shot examples) at the **beginning** of the prompt so cache prefixes remain byte-identical across turns.

---

## 3. Bounded Tool-Use Loop

Always cap the maximum number of tool-call iterations (`MAX_TOOL_ROUNDS = 6`) so a confused model cannot loop indefinitely or exhaust token budgets:

```python
from decimal import Decimal
import anthropic

MAX_TOOL_ROUNDS = 6

async def run_agent_loop(
    client: anthropic.AsyncAnthropic,
    messages: list[dict],
    tools: list[dict],
) -> str:
    for _ in range(MAX_TOOL_ROUNDS):
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            tools=tools,
            messages=messages,
        )
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            return "".join(
                block.text for block in response.content if block.type == "text"
            )

        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result_str = await execute_tool_safely(block.name, block.input)
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_str,
                    }
                )
        messages.append({"role": "user", "content": tool_results})

    raise RuntimeError("Exceeded maximum tool-use rounds")
```

---

## 4. Structured Document Extraction Ladder

When extracting structured records (e.g., receipts or statements) from PDFs/images:
1. Validate output with a strict **Pydantic v2** model (`extra="forbid"`, `Decimal` for monetary fields serialized as strings).
2. Verify accounting invariants deterministically in Python (`sum(line_items) + tax - discount == total`). If the invariant fails, flag the extraction confidence rather than mutating numbers silently.
3. Maintain **golden prompt tests** (`tests/golden/`) and deterministic fixture tests (`receipt_clean.json`, `receipt_wrong_total.json`) so prompt edits are regression-tested offline.
