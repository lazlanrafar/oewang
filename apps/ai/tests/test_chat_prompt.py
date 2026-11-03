"""The system prompt.

A golden file rather than an assertion per line: the prompt is one artefact,
and a change to any part of it should arrive as a diff somebody reads
(docs/ai/service.md#testing). The cases below the golden test are the
branches the golden context cannot cover at the same time.
"""

from __future__ import annotations

from pathlib import Path

from app.modules.chat.prompt import build_system_prompt
from app.modules.chat.schemas import AgentSettings, Category, Wallet, WorkspaceContext

GOLDEN = Path(__file__).parent / "golden" / "chat_system_prompt.txt"

CONTEXT = WorkspaceContext(
    currency_code="IDR",
    today="2026-11-02",
    timezone="Asia/Makassar",
    wallets=[
        Wallet(id="clxwallet1", name="Cash", balance="250000.0000", is_default=True),
        Wallet(id="clxwallet2", name="Savings USD", balance="1200.0000", currency_code="USD"),
    ],
    categories=[
        Category(id="clxcat1", name="Food", type="expense"),
        Category(id="clxcat2", name="Transport", type="expense"),
        Category(id="clxcat3", name="Salary", type="income"),
    ],
)


def test_the_prompt_for_a_fixed_context_matches_the_golden_file() -> None:
    prompt = build_system_prompt(
        role="admin",
        context=CONTEXT,
        settings=AgentSettings(
            custom_instructions="Always name the wallet.", response_language="auto"
        ),
    )

    assert prompt == GOLDEN.read_text()


def test_the_date_block_is_precomputed() -> None:
    """The model derives no boundary, so each one is in the prompt already
    (D27). A quarter is the case that goes wrong quietly."""
    prompt = build_system_prompt(
        role="admin",
        context=CONTEXT.model_copy(update={"today": CONTEXT.today.replace(month=2, day=14)}),
        settings=AgentSettings(),
    )

    assert "- Today: 2026-02-14 (Q1 2026)" in prompt
    assert "- This month: 2026-02-01 to 2026-02-14" in prompt
    assert "- This quarter: 2026-01-01 to 2026-02-14" in prompt
    assert "- This year: 2026-01-01 to 2026-02-14" in prompt


def test_the_prompt_forbids_arithmetic() -> None:
    """D27 is the rule the whole product leans on: a model's arithmetic
    error looks exactly like a correct answer."""
    prompt = build_system_prompt(role="owner", context=CONTEXT, settings=AgentSettings())

    assert "You do no arithmetic." in prompt
    assert "Never invent or guess a number" in prompt


def test_a_member_is_told_writes_will_be_refused() -> None:
    """Guidance, not the control: the API refuses the write whatever the
    prompt said (SEC-23)."""
    prompt = build_system_prompt(role="member", context=CONTEXT, settings=AgentSettings())

    assert "every write will be refused" in prompt
    assert "Reads and writes are both allowed" not in prompt


def test_the_language_rule_follows_the_setting() -> None:
    for language, expected in (
        ("auto", "Reply in the language the user wrote in."),
        ("english", "Reply in English"),
        ("indonesian", "Reply in Bahasa Indonesia"),
    ):
        prompt = build_system_prompt(
            role="admin",
            context=CONTEXT,
            settings=AgentSettings(response_language=language),
        )
        assert expected in prompt


def test_custom_instructions_are_absent_when_there_are_none() -> None:
    """An empty section would read as an instruction to the model."""
    for value in (None, "", "   "):
        prompt = build_system_prompt(
            role="admin",
            context=CONTEXT,
            settings=AgentSettings(custom_instructions=value),
        )
        assert "## Custom instructions" not in prompt


def test_balances_are_quoted_not_computed() -> None:
    """A wallet with its own currency keeps it (D37), and the string on the
    wire is the string in the prompt (D12)."""
    prompt = build_system_prompt(role="admin", context=CONTEXT, settings=AgentSettings())

    assert "- Cash (IDR 250000.0000, default) [id: clxwallet1]" in prompt
    assert "- Savings USD (USD 1200.0000) [id: clxwallet2]" in prompt


def test_an_empty_workspace_says_so() -> None:
    empty = WorkspaceContext(currency_code="IDR", today="2026-11-02")

    prompt = build_system_prompt(role="admin", context=empty, settings=AgentSettings())

    assert "This workspace has no wallets yet." in prompt
    assert "This workspace has no categories yet." in prompt
    # No timezone was given, so the line is dropped rather than guessed.
    assert "- Timezone:" not in prompt
