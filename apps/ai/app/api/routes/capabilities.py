"""Capability endpoints Elysia calls over HTTP (replacing the in-process
@workspace/ai imports): receipt OCR, CSV/XLSX extraction, vault chunking, and the
MCP tool-schema list. Auth via x-api-key (applied in main.py).
"""

import asyncio

from fastapi import APIRouter

from app.core import quota
from app.core.embeddings import embed
from app.modules.chatbot.service import run_chat
from app.modules.chatbot.tools import WEB_TOOLS
from app.modules.execution.executor import execute_tool
from app.modules.imports.service import extract_transactions, parse_file_to_rows
from app.modules.receipt.service import parse_receipt
from app.modules.vault import chunking
from app.schemas.capabilities import (
    ChatRunRequest,
    ImportExtractRequest,
    ReceiptParseRequest,
    ToolExecuteRequest,
    VaultChunkRequest,
)

router = APIRouter(tags=["capabilities"])


@router.post("/receipt/parse")
async def post_receipt_parse(req: ReceiptParseRequest) -> dict:
    if req.workspace_id:
        await quota.check_quota(req.workspace_id)
    parsed, usage = await asyncio.to_thread(
        parse_receipt, req.file.data, req.file.type, req.categoryContext
    )
    if req.workspace_id:
        await quota.record_usage(req.workspace_id, usage)
    return {"parsed": parsed}


@router.post("/import/extract")
async def post_import_extract(req: ImportExtractRequest) -> dict:
    if req.workspace_id:
        await quota.check_quota(req.workspace_id)
    rows = req.rows
    if rows is None and req.data and req.mimeType:
        rows = await asyncio.to_thread(parse_file_to_rows, req.data, req.mimeType)
    txns, usage = await asyncio.to_thread(
        extract_transactions, rows or [], req.walletNames, req.categoryNames
    )
    if req.workspace_id:
        await quota.record_usage(req.workspace_id, usage)
    return {"transactions": txns}


@router.post("/vault/chunk")
async def post_vault_chunk(req: VaultChunkRequest) -> dict:
    if not chunking.is_indexable(req.mimeType):
        return {"indexable": False, "chunks": []}
    text = await asyncio.to_thread(chunking.extract_text, req.data, req.mimeType)
    if not text:
        return {"indexable": True, "chunks": []}
    chunks = chunking.chunk(text)
    if chunks:
        vectors = await asyncio.to_thread(embed, [c["content"] for c in chunks])
        for c, v in zip(chunks, vectors, strict=True):
            c["embedding"] = v
    return {"indexable": True, "chunks": chunks}


@router.get("/tools/definitions")
async def get_tools_definitions() -> dict:
    """The canonical AI tool schemas, for the MCP server to register at startup."""
    return {"tools": WEB_TOOLS}


@router.post("/tools/execute")
async def post_tools_execute(req: ToolExecuteRequest) -> dict:
    """Run one tool (DB writes, audit, canvas) — the money path, now in Python.
    Used by the MCP server. Identity is passed by the trusted caller (x-api-key)."""
    return await execute_tool(req.tool, req.input or {}, req.workspace_id, req.user_id)


@router.post("/chat/run")
async def post_chat_run(req: ChatRunRequest) -> dict:
    """LLM tool loop for the WhatsApp/Telegram + in-process fallback path. Elysia
    builds the prompt/history (chat-begin) and persists the reply (chat-end); this
    runs the loop and executes tools locally."""
    return await run_chat(
        req.system_prompt, req.history, req.workspace_id, req.user_id
    )
