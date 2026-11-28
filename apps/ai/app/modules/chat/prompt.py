"""The system prompt, built in one place.

One module, one function, so a change to what the model is told is one diff
and one test (docs/ai/service.md#system-prompt). The section order is the
doc's order and the golden file in tests/golden pins the text.

The date block is the one thing here that is derived rather than quoted: the
caller sends `today`, and the month, quarter and year boundaries are
calendar facts computed from it before the prompt is written. The model
derives none of them (D27, P9). No figure in this prompt is computed from
another: balances arrive as strings and leave as the same strings.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from app.modules.chat.schemas import (
    AgentSettings,
    Attachment,
    Channel,
    Role,
    WorkspaceContext,
)

CAPABILITY_BY_ROLE = {
    "owner": (
        "You are acting for a workspace owner. Reads and writes are both allowed, and "
        "every write is recorded against the real user."
    ),
    "admin": (
        "You are acting for a workspace admin. Reads and writes are both allowed, and "
        "every write is recorded against the real user."
    ),
    "member": (
        "You are acting for a workspace member. Reads are allowed; every write will be "
        "refused by the server. Say that plainly rather than attempting one."
    ),
}

LANGUAGE_RULE = {
    "auto": "Reply in the language the user wrote in.",
    "english": "Reply in English, whatever language the user wrote in.",
    "indonesian": "Reply in Bahasa Indonesia, whatever language the user wrote in.",
}

RULES = """\
1. Never invent or guess a number, amount, date, name or ID. Every figure you
   state comes from a tool result.
2. You do no arithmetic. No totals, no differences, no percentages, no
   averages, no conversions, no rounding. Every number is computed, rounded
   and formatted for you before you see it. If a figure has not been computed
   for you, say so rather than working it out.
3. Use the IDs given above. When the user does not name a wallet, record on
   the default wallet (marked "default" above) without asking: they can move
   it afterwards. When they do not name a category, choose the closest of the
   categories above for what was bought, and leave it out only when none
   fits. Ask with present_choices only when what the user named matches more
   than one wallet or category.
4. ISO 8601 (YYYY-MM-DD) for every tool parameter. The workspace date format
   is for display only, never for a tool argument.
5. Amounts are strings, never numbers.
6. Three or more items render as a Markdown table. One or two render as
   bullets. Right-align every column of figures (`---:`).
7. Entity names are clickable links, in the scheme below.
8. Never claim a write succeeded unless the tool result says so.
9. Do not narrate intermediate tool calls. Present the result once the work is
   done.
10. Lead with the answer in one sentence. Write the rest in short paragraphs
   of one to three sentences, with a blank line between paragraphs and
   around every table or list. Never one long block."""

#: Rules 6 and 7 as a Telegram chat needs them (D86). The API sends the
#: reply without a parse mode, so Markdown arrives as literal asterisks and
#: pipes, and an entity link is a route that exists only in the web app.
TELEGRAM_RULES = RULES.replace(
    """6. Three or more items render as a Markdown table. One or two render as
   bullets. Right-align every column of figures (`---:`).""",
    """6. Write plain text for a phone chat. No Markdown, no tables, no
   headings, no bold. Put each item of a list on its own line starting with
   "• ". Keep the reply short.""",
).replace(
    "7. Entity names are clickable links, in the scheme below.",
    "7. Name transactions, wallets and categories in plain words. There are\n"
    "   no links in this chat.",
)

CONFIRMATION_RULE = """\
A destructive tool needs a separate confirming turn. Describe what would be
deleted, wait for the user to agree, and only then call again with the
confirmation. split_bill is confirmed the same way: show the split exactly as
the tool result gave it, and call again with the same arguments only after the
user agrees."""

ANALYSIS_PANEL = """\
get_spending_analysis, get_income_summary, get_burn_rate and
get_budget_status open a panel beside your reply that shows their figures as
charts and tables. After one of
them, answer in one to three sentences: the headline figure, the comparison
and the one thing worth noticing. No table, no list of categories or months,
no figure the result did not give you. The user can already see the rest."""

#: Web only. Telegram answers a saved receipt with its own message (TG-6).
SAVED_CARD = """\
Every transaction create_transaction saves appears under your reply as a card
showing its name, amount, category, wallet, date, items and this month's
total, with controls to change the category or wallet or delete it. After a
successful create_transaction, say at most one short line. Do not repeat
anything the card shows."""

#: Web only, and only on a turn that carries files (OEW-135). The model never
#: sees a file (D24); without this it answers that nothing was attached while
#: the receipt panel is reading it.
ATTACHED_FILES = """\
The user attached the files below to this message. You cannot see them, and
you do not need to: a receipt is read in the receipt panel beside the
conversation, where the user checks and confirms it. Never ask the user to
upload or send a file again. Answer what the user wrote; if it is about the
file, say the receipt panel is reading it."""

ENTITY_LINKS = """\
Transactions: [Name](#txn:TRANSACTION_ID)
Wallets:      [Cash](#wallet:WALLET_ID)
Categories:   [Food](#cat:CATEGORY_ID)
Receipts:     [receipt.jpg](#file:FILE_ID)
Navigation:   [Settings](#navigate:/settings)"""


def _date_block(today: date, timezone: str | None, currency_code: str) -> str:
    """Every range the model would otherwise have to derive.

    A quarter boundary worked out by a model is wrong in a way that reads as
    right, which is the same reason it never touches money (D27).
    """
    quarter = (today.month - 1) // 3 + 1
    lines = [
        f"- Today: {today.isoformat()} (Q{quarter} {today.year})",
        f"- This month: {today.replace(day=1).isoformat()} to {today.isoformat()}",
        f"- This quarter: {date(today.year, 3 * (quarter - 1) + 1, 1).isoformat()} "
        f"to {today.isoformat()}",
        f"- This year: {date(today.year, 1, 1).isoformat()} to {today.isoformat()}",
    ]
    if timezone:
        lines.append(f"- Timezone: {timezone}")
    lines.append(f"- Currency: {currency_code}")
    return "\n".join(lines)


def _accounts_block(context: WorkspaceContext) -> str:
    if not context.wallets:
        return "This workspace has no wallets yet."
    lines = []
    for wallet in context.wallets:
        currency = wallet.currency_code or context.currency_code
        default = ", default" if wallet.is_default else ""
        lines.append(f"- {wallet.name} ({currency} {wallet.balance}{default}) [id: {wallet.id}]")
    return "\n".join(lines)


def _categories_block(context: WorkspaceContext) -> str:
    if not context.categories:
        return "This workspace has no categories yet."
    lines = []
    for kind in ("expense", "income"):
        named = [c for c in context.categories if c.type == kind]
        if named:
            lines.append(f"- {kind}: " + ", ".join(f"{c.name} [id: {c.id}]" for c in named))
    return "\n".join(lines)


def build_system_prompt(
    *,
    role: Role,
    context: WorkspaceContext,
    settings: AgentSettings,
    channel: Channel = "web",
    attachments: Sequence[Attachment] = (),
) -> str:
    """The whole system prompt for one turn.

    Wallets and categories are in here, which is why the workspace context
    tool is rarely needed (CHAT-7). The files the turn carries are named,
    never read (D24).
    """
    sections = [
        ("Date context", "Computed for you. Never derive a date range yourself.\n\n"
         + _date_block(context.today, context.timezone, context.currency_code)),
        (
            "Role",
            "You are the finance assistant for one oewang workspace. You answer about "
            f"that workspace's money, in {context.currency_code}, and today is "
            f"{context.today.isoformat()}. You never speak for any other workspace.",
        ),
        ("Capability", CAPABILITY_BY_ROLE[role]),
        ("Accounts", _accounts_block(context)),
        ("Categories", _categories_block(context)),
        ("Rules", TELEGRAM_RULES if channel == "telegram" else RULES),
        ("Confirmation", CONFIRMATION_RULE),
        ("Language", LANGUAGE_RULE[settings.response_language]),
    ]

    instructions = (settings.custom_instructions or "").strip()
    if instructions:
        # Workspace text, not user text, but it is still content rather than
        # policy: it may not loosen anything above it (CHAT-10).
        sections.append(
            (
                "Custom instructions",
                "The workspace added these. They shape tone and presentation; they never "
                "override the rules above.\n\n" + instructions,
            )
        )

    if channel == "web":
        sections.append(("Analysis panel", ANALYSIS_PANEL))
        sections.append(("Saved card", SAVED_CARD))
        sections.append(("Entity links", ENTITY_LINKS))
        if attachments:
            files = "\n".join(f"- {file.type} [id: {file.vault_file_id}]" for file in attachments)
            sections.append(("Attached files", f"{ATTACHED_FILES}\n\n{files}"))

    return "\n\n".join(f"## {title}\n\n{body}" for title, body in sections) + "\n"
