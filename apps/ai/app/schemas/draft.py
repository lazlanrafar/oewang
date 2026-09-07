"""Request models for the Telegram-facing draft-flow endpoints — service-to-
service (x-api-key only, no JWT), mirroring the trust model /tools/execute and
/chat/run already use. workspace_id/user_id are explicit in the body because
the caller (Telegram's webhook handler) has no end-user JWT to forward.
"""

from pydantic import BaseModel


class LatestStateRequest(BaseModel):
    history: list[dict]


class DraftMessage(BaseModel):
    role: str
    content: str


class HandlePendingRequest(BaseModel):
    workspace_id: str
    user_id: str
    message: DraftMessage
    draft: dict
    session_id: str


class BuildFromAttachmentsRequest(BaseModel):
    workspace_id: str
    user_id: str
    attachments: list[dict]
