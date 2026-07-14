"""Request/response models for the ported capabilities (receipt, import, vault)."""

from pydantic import BaseModel


class FilePayload(BaseModel):
    data: str  # base64
    type: str  # mime type
    name: str | None = None


class ReceiptParseRequest(BaseModel):
    file: FilePayload
    categoryContext: str = ""
    # Optional for wire compat with older callers; when set, the call is
    # quota-checked and metered against the workspace.
    workspace_id: str | None = None


class ImportExtractRequest(BaseModel):
    # Either pass a raw file (data+mimeType, parsed to rows here) or pre-parsed rows.
    data: str | None = None
    mimeType: str | None = None
    rows: list[dict] | None = None
    walletNames: list[str] = []
    categoryNames: list[str] = []
    workspace_id: str | None = None


class VaultChunkRequest(BaseModel):
    data: str  # base64
    mimeType: str
    fileName: str | None = None


class ToolExecuteRequest(BaseModel):
    tool: str
    input: dict | None = None
    workspace_id: str
    user_id: str


class ChatRunRequest(BaseModel):
    system_prompt: str
    history: list[dict]
    workspace_id: str
    user_id: str
    web_search: bool = False
