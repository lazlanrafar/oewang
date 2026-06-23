from fastapi import APIRouter

from app.modules.chatbot.service import chat
from app.schemas.chatbot import ChatRequest, ChatResponse

router = APIRouter(tags=["chatbot"])


@router.post("/chat", response_model=ChatResponse)
async def post_chat(req: ChatRequest) -> ChatResponse:
    result = await chat(req.message, req.workspace_id, req.user_id, req.session_id)
    return ChatResponse(**result)
