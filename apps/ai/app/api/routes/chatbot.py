from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse

from app.modules.chatbot.service import chat, web_chat
from app.modules.chatbot.tools import ApiError
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


@router.post("/chat/web")
async def post_chat_web(
    req: WebChatRequest, authorization: str | None = Header(default=None)
):
    token = (
        authorization.split(" ", 1)[1]
        if authorization and " " in authorization
        else None
    )
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        result = await web_chat(
            [m.model_dump() for m in req.messages],
            token,
            req.session_id,
            req.web_search,
        )
    except ApiError as e:
        # < 500 = a real answer (quota/auth) → forward the TS body verbatim so the
        # browser sees the same code/meta. >= 500 = infra → let the server action
        # fall back to the in-process /ai/chat path.
        if e.status_code < 500:
            return JSONResponse(status_code=e.status_code, content=e.body)
        raise HTTPException(status_code=502, detail="upstream error")
    return WebChatResponse(**result)
