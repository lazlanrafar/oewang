"""`GET /tools/definitions`.

The catalog the model is shown, served so the API can validate against the
same definitions (docs/ai/service.md#tool-catalog). One source, two readers:
if the Rust validator and this module ever disagree, the disagreement is
visible here rather than at the moment a tool call is refused.

A service-to-service route like every other: the shared key, the per-caller
ceiling and OWE1 all apply. It is not a plaintext exception. The definitions
are not a secret, but the exception list in
docs/api/encryption.md#plaintext-exceptions is short on purpose and nothing
here needs to be on it.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from app.core.envelope import envelope
from app.modules.chat.tools import TOOL_DEFINITIONS

router = APIRouter()


@router.get("/tools/definitions")
async def tool_definitions(request: Request) -> dict[str, Any]:
    """Every tool, in the catalog's order.

    `data` is the list itself, so a caller deserializes it straight into its
    own definition type. The envelope is the API's, because one client parses
    both services (docs/api/conventions.md).
    """
    return envelope(TOOL_DEFINITIONS, request.headers.get("x-owe-request-id", ""))
