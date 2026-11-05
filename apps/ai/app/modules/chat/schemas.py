"""What `POST /chat/stream` accepts.

The shape is the API's, specified in docs/ai/service.md. Everything the turn
needs arrives in the body: this service holds no database connection and
fetches nothing on its own (D3, CHAT-7).

Money is a string here and stays one. Nothing in this service parses an
amount into a float (D12) and nothing computes with it (D27).
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["owner", "admin", "member"]
#: Where a reply is read: the web app renders Markdown and entity links, a
#: Telegram chat shows plain text (D86).
Channel = Literal["web", "telegram"]
ResponseLanguage = Literal["auto", "english", "indonesian"]

#: How many earlier messages travel with a turn. A conversation grows without
#: limit; the cost of a turn must not (docs/ai/service.md#the-tool-loop).
HISTORY_WINDOW = 20


class Wallet(BaseModel):
    id: str
    name: str
    balance: str
    #: A wallet may hold a currency of its own (D37). Absent means the
    #: workspace currency.
    currency_code: str | None = None
    is_default: bool = False


class Category(BaseModel):
    id: str
    name: str
    type: Literal["income", "expense"]


class WorkspaceContext(BaseModel):
    currency_code: str
    today: date
    #: The workspace timezone, when the caller knows it. The date block drops
    #: the line rather than guessing a zone.
    timezone: str | None = None
    wallets: list[Wallet] = Field(default_factory=list)
    categories: list[Category] = Field(default_factory=list)


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class Attachment(BaseModel):
    vault_file_id: str
    type: str
    url: str


class AgentSettings(BaseModel):
    custom_instructions: str | None = None
    response_language: ResponseLanguage = "auto"


class ChatStreamRequest(BaseModel):
    """One user turn.

    `role` is a claim, not a fact: it shapes what the prompt tells the model,
    and the API re-reads the membership row before any write (SEC-23). The
    prompt is guidance; the role gate is the control.
    """

    workspace_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    role: Role
    session_id: str = Field(min_length=1)
    #: The API's id for this turn, minted by the API and echoed back on every
    #: tool call (US-030). Required, and never generated here: the per-turn
    #: blast-radius caps are counted against it (D25, SEC-23), so a service
    #: that minted its own id per call would start a fresh count each time
    #: and walk straight through the caps.
    turn_id: str = Field(min_length=1)
    message: str = Field(min_length=1)
    history: list[Message] = Field(default_factory=list)
    context: WorkspaceContext
    settings: AgentSettings = Field(default_factory=AgentSettings)
    attachments: list[Attachment] = Field(default_factory=list)
    #: Where the reply is read (D86). It changes how the answer is written,
    #: never what the model may do: the tools and every check behind them
    #: are the same on both.
    channel: Channel = "web"

    def bounded_history(self) -> list[dict[str, str]]:
        """The tail of the conversation, starting at a user message.

        The model rejects a turn that opens on an assistant message, which is
        exactly what slicing a window can produce.
        """
        window = self.history[-HISTORY_WINDOW:]
        start = next((i for i, message in enumerate(window) if message.role == "user"), len(window))
        return [{"role": message.role, "content": message.content} for message in window[start:]]
