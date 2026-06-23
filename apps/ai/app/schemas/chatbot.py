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
