from pydantic import BaseModel, Field, field_validator


class ChatRequest(BaseModel):
    message: str
    workspace_id: str = Field(min_length=1)
    user_id: str | None = None
    session_id: str | None = None

    @field_validator("message")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("message is empty")
        return v


class ChatResponse(BaseModel):
    reply: str
    session_id: str | None = None


# --- Website-compatible contract (mirrors apps/api ChatRequestDto/ChatResponse) ---


class WebChatMessage(BaseModel):
    role: str  # user | assistant | system
    content: str


class WebChatRequest(BaseModel):
    workspace_id: str = Field(min_length=1)
    user_id: str | None = None
    messages: list[WebChatMessage] = Field(min_length=1)
    session_id: str | None = None
    web_search: bool = False
    # When the caller (Elysia AiService) already built the system prompt, it
    # passes it here to avoid a redundant call-back. Falls back to fetching it.
    system_prompt: str | None = None


class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0


class Provider(BaseModel):
    name: str = "openai"
    response_id: str | None = None


class WebChatResponse(BaseModel):
    session_id: str | None = None
    reply: str
    usage: Usage | None = None
    artifact: dict | None = None  # phase 2: canvas artifacts
    provider: Provider | None = None
