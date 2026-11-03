"""The response envelope, shared with the API.

Same three keys as docs/api/conventions.md, because the API's client reads
both services' answers with one parser. A failure the caller may not be able
to decrypt (a crypto failure, a missing key, a rate limit) is marked as a
transport error so the OWE1 layer leaves it in plaintext.
"""

from __future__ import annotations

from typing import Any

from fastapi import status
from fastapi.responses import JSONResponse

TRANSPORT_ERROR_HEADER = "x-owe-transport-error"

#: Failures that reach a caller holding no working key. They answer in
#: plaintext, which is the whole reason they are errors.
TRANSPORT_ERROR_CODES = frozenset(
    {
        "CRYPTO_SESSION_UNKNOWN",
        "CRYPTO_DECRYPT_FAILED",
        "CRYPTO_REPLAY_DETECTED",
        "CRYPTO_CLOCK_SKEW",
        "CRYPTO_QUERY_NOT_ENCRYPTED",
        "CRYPTO_VERSION_UNSUPPORTED",
        "UNAUTHORIZED",
        "RATE_LIMITED",
    }
)

# The statuses the API answers with, for the same codes
# (docs/api/encryption.md#errors). Both halves of OWE1 answer one protocol,
# so a client that branches on the status rather than the code must not get
# a different answer depending on which service it reached.
STATUS_BY_CODE = {
    "CRYPTO_SESSION_UNKNOWN": status.HTTP_401_UNAUTHORIZED,
    "CRYPTO_DECRYPT_FAILED": status.HTTP_400_BAD_REQUEST,
    "CRYPTO_REPLAY_DETECTED": status.HTTP_400_BAD_REQUEST,
    "CRYPTO_CLOCK_SKEW": status.HTTP_400_BAD_REQUEST,
    "CRYPTO_QUERY_NOT_ENCRYPTED": status.HTTP_400_BAD_REQUEST,
    "CRYPTO_VERSION_UNSUPPORTED": status.HTTP_400_BAD_REQUEST,
    "UNAUTHORIZED": status.HTTP_401_UNAUTHORIZED,
    "RATE_LIMITED": status.HTTP_429_TOO_MANY_REQUESTS,
    # Spelled out: Starlette renamed its constant and both spellings warn
    # on one version or the other.
    "VALIDATION_FAILED": 422,
}


def envelope(data: Any, request_id: str, **meta: Any) -> dict[str, Any]:
    return {"data": data, "error": None, "meta": {"request_id": request_id, **meta}}


def error_envelope(code: str, message: str, request_id: str, **extra: Any) -> dict[str, Any]:
    body = {"code": code, "message": message, "request_id": request_id, **extra}
    return {"data": None, "error": body, "meta": {"request_id": request_id}}


def error_response(code: str, message: str, request_id: str, **extra: Any) -> JSONResponse:
    response = JSONResponse(
        status_code=STATUS_BY_CODE.get(code, status.HTTP_400_BAD_REQUEST),
        content=error_envelope(code, message, request_id, **extra),
    )
    if code in TRANSPORT_ERROR_CODES:
        # Read by the OWE1 layer, which leaves this body in plaintext.
        response.headers[TRANSPORT_ERROR_HEADER] = "1"
    return response
