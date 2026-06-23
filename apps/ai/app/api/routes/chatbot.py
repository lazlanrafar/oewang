from fastapi import APIRouter

from app.modules.chatbot.service import chat, web_chat
from app.schemas.chatbot import (
    ChatRequest,
    ChatResponse,
    WebChatRequest,
    WebChatResponse,
)

router = APIRouter(tags=["chatbot"])


@router.post("/chat", response_model=ChatResponse)
async def post_chat(req: ChatRequest) -> ChatResponse:
    result = await chat(req.message, req.workspace_id, req.user_id, req.session_id)
    return ChatResponse(**result)


@router.post("/chat/web", response_model=WebChatResponse)
async def post_chat_web(req: WebChatRequest) -> WebChatResponse:
    result = await web_chat(
        req.messages, req.workspace_id, req.user_id, req.session_id, req.web_search
    )
    return WebChatResponse(**result)
