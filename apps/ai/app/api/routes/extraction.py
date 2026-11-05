"""`POST /receipt/parse`, `POST /import/extract` and `POST /import/map-columns`.

The capture half of the service (US-033, US-033b, US-035, US-022). The API
is the only caller and every body travels under OWE1, like every other
route here.

**None of these three routes gives the model a tool.** That is not a
property of this file, it is a property of the two functions underneath it
(`ladder._call_model` and `columns.map_columns`), which is where the
assertion in the tests points. A receipt is text somebody else wrote, so
the component that reads it has nothing to call, and an instruction
printed on a receipt reaches a model with no `create_transaction` to reach
for (D24, SEC-21).

Nothing here writes anything anywhere. A parsed receipt is a draft the
user confirms (AI-2); this service holds no database connection and no
storage credentials to persist one with (D3, D4).

The one piece of judgement in this module is what counts as a refusal.
A thin result is **returned**, carrying its score and its flagged fields,
because a partially read receipt the user corrects in two taps beats a
spinner that ends in a failure message. `RECEIPT_UNREADABLE` is for the
case where there is genuinely nothing to confirm (AI-3, AI-11).
"""

from __future__ import annotations

import base64
import binascii
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.config import Settings
from app.core import model
from app.core.envelope import envelope, error_response
from app.modules.extraction import categorize, columns, ladder
from app.modules.extraction.ladder import PDF_MEDIA_TYPE
from app.modules.extraction.schemas import (
    CategorizeRequest,
    ColumnMappingRequest,
    ExtractionRequest,
    extraction_payload,
)

router = APIRouter()

#: No model call answered in time or in shape, so nothing read the document.
NO_ANSWER_MESSAGE = "no extraction pass answered; try again"

#: Fixed text. An exception's own message can quote the request, and the
#: request is somebody's receipt (OPS-3).
MODEL_UNAVAILABLE_MESSAGE = "no model is configured"
MAPPING_FAILED_MESSAGE = "the model did not return a usable column mapping"
CATEGORIZE_FAILED_MESSAGE = "the model did not return a usable category"
UNREADABLE_MESSAGE = {
    "RECEIPT_UNREADABLE": "no total and no usable date could be read from this receipt",
    "STATEMENT_UNREADABLE": "no usable transaction rows could be read from this statement",
}


def request_id_of(request: Request, body: Any) -> str:
    """The id this request is logged and answered under.

    The OWE1 header is the authority, because it is what the response's
    own sealing is bound to. The body's `request_id` is the fallback, for
    the development path where encryption is off and there is no header.
    """
    return request.headers.get("x-owe-request-id", "") or body.request_id


def decode_document(media_type: str, data: str) -> bytes:
    """The document's bytes, for the deterministic PDF path only.

    An image is never decoded here: the model is handed the base64
    exactly as it arrived, and decoding a few megabytes to hand nobody
    the result is work for nothing.

    Base64 that does not decode is not fatal either. Empty bytes mean the
    text-layer pass finds nothing and the ladder escalates to the
    provider, which is the one that has to agree the document is a
    document.
    """
    if media_type != PDF_MEDIA_TYPE:
        return b""
    try:
        return base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        return b""


async def _extract(kind: str, body: ExtractionRequest, request: Request) -> JSONResponse | dict:
    config: Settings = request.app.state.config
    request_id = request_id_of(request, body)

    try:
        outcome = await ladder.run_ladder(
            kind=kind,
            media_type=body.document.media_type,
            data=body.document.data,
            raw=decode_document(body.document.media_type, body.document.data),
            workspace_currency=body.workspace_currency,
            today=body.today,
            config=config,
            # The body's id, not the header's: this is the one the API
            # minted for the whole upload, so the extraction line lines up
            # with the API's own log for it.
            request_id=body.request_id,
            workspace_id=body.workspace_id,
        )
    except ladder.NoAnswer:
        return error_response("EXTRACTION_NO_ANSWER", NO_ANSWER_MESSAGE, request_id)
    except ladder.Unreadable as unreadable:
        return error_response(
            unreadable.code, UNREADABLE_MESSAGE[unreadable.code], request_id
        )
    except model.ModelUnavailable:
        return error_response("MODEL_UNAVAILABLE", MODEL_UNAVAILABLE_MESSAGE, request_id)

    return envelope(
        extraction_payload(
            kind=kind,
            result=outcome.result,
            score=outcome.score,
            low_confidence=outcome.low_confidence_fields,
            passes=outcome.passes,
            models=outcome.models,
            today=body.today,
        ),
        request_id,
    )


@router.post("/receipt/parse", response_model=None)
async def receipt_parse(body: ExtractionRequest, request: Request) -> JSONResponse | dict:
    """One receipt image or PDF to a draft the user confirms (AI-1, AI-2)."""
    return await _extract("receipt", body, request)


@router.post("/import/extract", response_model=None)
async def import_extract(body: ExtractionRequest, request: Request) -> JSONResponse | dict:
    """One statement image or PDF to transaction rows (AI-4, US-035).

    Only for an image or a PDF. Anything with columns goes through
    `/import/map-columns` instead, because deterministic beats
    model-driven whenever structure already exists (D28).
    """
    return await _extract("statement", body, request)


@router.post("/import/map-columns", response_model=None)
async def map_columns(body: ColumnMappingRequest, request: Request) -> JSONResponse | dict:
    """Column names and two sample rows to a mapping (D28, AI-9).

    One small call, not the ladder. The model never sees an amount it is
    asked to convert and never produces one: every row is transformed by
    deterministic Rust afterwards, so the cost is one call whether the
    file has ten rows or ten thousand.
    """
    config: Settings = request.app.state.config
    request_id = request_id_of(request, body)

    try:
        mapping, used = await columns.map_columns(
            columns=body.columns,
            # Clamped on the model, not on the prompt builder: two rows,
            # each cell at 80 characters.
            sample_rows=body.clamped_rows(),
            config=config,
        )
    except columns.MappingFailed:
        return error_response("COLUMN_MAPPING_FAILED", MAPPING_FAILED_MESSAGE, request_id)
    except model.ModelUnavailable:
        return error_response("MODEL_UNAVAILABLE", MODEL_UNAVAILABLE_MESSAGE, request_id)

    return envelope({"mapping": mapping, "model": used}, request_id)


@router.post("/receipt/categorize", response_model=None)
async def receipt_categorize(body: CategorizeRequest, request: Request) -> JSONResponse | dict:
    """A saved receipt's merchant and items to one of the workspace's
    expense category names, or null (D86).

    Strings in, one name out. The API keeps the answer only when it is
    exactly one of the workspace's categories.
    """
    config: Settings = request.app.state.config
    request_id = request_id_of(request, body)

    try:
        category, used = await categorize.categorize(
            merchant=body.merchant,
            items=body.items,
            categories=body.categories,
            config=config,
        )
    except categorize.CategorizeFailed:
        return error_response("CATEGORIZE_FAILED", CATEGORIZE_FAILED_MESSAGE, request_id)
    except model.ModelUnavailable:
        return error_response("MODEL_UNAVAILABLE", MODEL_UNAVAILABLE_MESSAGE, request_id)

    return envelope({"category": category, "model": used}, request_id)
