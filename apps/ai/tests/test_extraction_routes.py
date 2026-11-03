"""`POST /receipt/parse` and `POST /import/extract`, over the wire.

Driven through the real OWE1 client, the real middleware stack and the
real routes, with only the model scripted. What these assert is the
contract the API reads: the envelope, the money-as-strings rule, the
status an unreadable document answers with, and the refusals that have to
be refusals rather than a 500.

Money is checked as text on purpose. `"87500.0000"` and `87500.0` are the
same number and a different contract, and the second one has been through
a float by the time the API's decimal parser sees it (D12).
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from app.core import model
from tests.extraction_support import (
    Answer,
    ScriptedClient,
    answer,
    assert_no_tools,
    fixture_base64,
)
from tests.support import Owe1TestClient

TODAY = "2026-11-03"


def payload(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "request_id": "01JC0TESTREQUEST",
        "workspace_id": "clxworkspace1",
        "document": {"media_type": "image/png", "data": fixture_base64("tiny.png")},
        "workspace_currency": "IDR",
        "today": TODAY,
    }
    body.update(overrides)
    return body


def parse(client: Owe1TestClient, path: str = "/receipt/parse", **overrides: Any) -> dict:
    return client.call("POST", path, body=payload(**overrides))


# --------------------------------------------------------- receipt/parse


def test_a_receipt_comes_back_as_a_draft(owe1_client: Owe1TestClient) -> None:
    scripted = ScriptedClient(answer("receipt_clean.json"))
    model.set_model_client(scripted)

    body = parse(owe1_client)
    draft = body["data"]["draft"]

    assert draft["merchant"] == "Warung Tekko"
    assert draft["date"] == "2026-11-02"
    assert draft["currency"] == "IDR"
    assert body["data"]["passes"] == 1
    assert_no_tools(scripted)


def test_every_money_figure_is_a_string(owe1_client: Owe1TestClient) -> None:
    """Read out of the raw JSON, not the parsed object: the thing being
    asserted is the wire format (D12)."""
    model.set_model_client(ScriptedClient(answer("receipt_clean.json")))

    response, request_id = owe1_client.request("POST", "/receipt/parse", body=payload())
    raw = owe1_client.open_response(response, request_id)
    draft = raw["data"]["draft"]

    assert draft["total"] == "87500.0000"
    assert draft["subtotal"] == "80000.0000"
    assert draft["tax"] == "7500.0000"
    assert draft["line_items"][0]["amount"] == "45000.0000"
    assert draft["line_items"][0]["unit_price"] == "45000.0000"
    assert draft["line_items"][1]["quantity"] == "2"

    text = json.dumps(raw)
    assert "87500.0" not in text.replace('"87500.0000"', ""), "no bare number anywhere"


def test_the_quality_block_is_always_complete(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient(answer("receipt_clean.json")))

    quality = parse(owe1_client)["data"]["quality"]

    assert quality == {"score": 100, "low_confidence_fields": [], "corrected_fields": []}


def test_corrected_fields_is_always_empty_from_this_service(
    owe1_client: Owe1TestClient,
) -> None:
    """Cross-field consistency is the API's pure Rust pass (D30, AI-7).
    Two layers correcting the same number is how a user ends up unable to
    tell which figure came off the receipt."""
    model.set_model_client(ScriptedClient(answer("receipt_wrong_total.json")))

    body = parse(owe1_client)

    assert body["data"]["quality"]["corrected_fields"] == []
    assert body["data"]["draft"]["total"] == "62000.0000", "as printed, not corrected"


def test_a_weak_draft_is_returned_marked_rather_than_refused(
    owe1_client: Owe1TestClient,
) -> None:
    """Below the threshold is not an error (AI-11)."""
    model.set_model_client(ScriptedClient(answer("receipt_poor.json")))

    body = parse(owe1_client)

    assert body["error"] is None
    assert body["data"]["quality"]["score"] == 30
    assert "date" in body["data"]["quality"]["low_confidence_fields"]


def test_a_date_that_did_not_validate_is_absent_not_guessed(
    owe1_client: Owe1TestClient,
) -> None:
    model.set_model_client(ScriptedClient(Answer(text='{"total": "500.00", "date": "soon"}')))

    body = parse(owe1_client)

    assert "date" not in body["data"]["draft"]
    assert "date" in body["data"]["quality"]["low_confidence_fields"]


def test_an_unreadable_receipt_is_a_422_not_a_500(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient(answer("receipt_empty.json")))

    response, request_id = owe1_client.request("POST", "/receipt/parse", body=payload())
    body = owe1_client.open_response(response, request_id)

    assert response.status_code == 422
    assert body["error"]["code"] == "RECEIPT_UNREADABLE"
    assert body["data"] is None


def test_the_models_used_are_reported(owe1_client: Owe1TestClient) -> None:
    """So the API can log what an upload cost, and so the ladder's
    threshold can be judged from real traffic."""
    model.set_model_client(
        ScriptedClient(answer("receipt_poor.json"), answer("receipt_clean.json"))
    )
    config = owe1_client.http.app.state.config

    body = parse(owe1_client)

    assert body["data"]["models"] == [config.ai_vision_primary, config.ai_vision_tertiary]
    assert body["data"]["passes"] == 2


# -------------------------------------------------------- import/extract


def test_a_statement_comes_back_as_rows(owe1_client: Owe1TestClient) -> None:
    scripted = ScriptedClient(answer("statement_clean.json"))
    model.set_model_client(scripted)

    body = parse(owe1_client, "/import/extract")
    rows = body["data"]["rows"]

    assert len(rows) == 3
    assert rows[0] == {
        "date": "2026-11-02",
        "amount": "87500.0000",
        "description": "WARUNG TEKKO",
        "direction": "expense",
    }
    assert body["data"]["quality"]["score"] == 100
    assert_no_tools(scripted)


def test_a_statement_row_without_a_date_is_dropped(owe1_client: Owe1TestClient) -> None:
    """The API would discard it anyway, and the score has already counted
    it against the page."""
    model.set_model_client(ScriptedClient(answer("statement_poor.json")))

    body = parse(owe1_client, "/import/extract")

    assert len(body["data"]["rows"]) == 1
    assert body["data"]["quality"]["score"] == 25


def test_an_unreadable_statement_has_its_own_code(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient(Answer(text='{"rows": []}')))

    response, request_id = owe1_client.request("POST", "/import/extract", body=payload())
    body = owe1_client.open_response(response, request_id)

    assert response.status_code == 422
    assert body["error"]["code"] == "STATEMENT_UNREADABLE"


def test_a_pdf_with_a_text_layer_reaches_no_model_through_the_route(
    owe1_client: Owe1TestClient,
) -> None:
    """The plumbing for D42, end to end: the route decodes the base64 for
    the text-layer pass and the ladder answers from the characters."""
    scripted = ScriptedClient(answer("receipt_clean.json"))
    model.set_model_client(scripted)
    document = {
        "media_type": "application/pdf",
        "data": fixture_base64("receipt_text_layer.pdf"),
    }

    body = parse(owe1_client, document=document)

    assert scripted.calls == []
    assert body["data"]["passes"] == 0
    assert body["data"]["models"] == ["pdf-text-layer"]
    assert body["data"]["draft"]["total"] == "87500.0000"


# ----------------------------------------------------------- refusals


@pytest.mark.parametrize("media_type", ["image/gif", "application/zip", "text/plain", ""])
def test_an_unsupported_media_type_is_a_400_in_the_envelope(
    owe1_client: Owe1TestClient, media_type: str
) -> None:
    """Not a 500 three layers down when the provider rejects the block,
    and not FastAPI's own shape either: one client parses both services."""
    model.set_model_client(ScriptedClient())
    body = payload()
    body["document"]["media_type"] = media_type

    response, request_id = owe1_client.request("POST", "/receipt/parse", body=body)
    opened = owe1_client.open_response(response, request_id)

    assert response.status_code == 400
    assert opened["error"]["code"] == "UNSUPPORTED_MEDIA_TYPE"
    assert opened["data"] is None


@pytest.mark.parametrize(
    "media_type", ["image/jpeg", "image/png", "image/webp", "application/pdf"]
)
def test_the_four_supported_media_types_are_accepted(
    owe1_client: Owe1TestClient, media_type: str
) -> None:
    model.set_model_client(ScriptedClient(answer("receipt_clean.json")))
    body = payload()
    body["document"]["media_type"] = media_type

    response, request_id = owe1_client.request("POST", "/receipt/parse", body=body)

    assert response.status_code == 200, media_type


def test_a_refused_body_never_echoes_the_document_back(
    owe1_client: Owe1TestClient,
) -> None:
    """FastAPI's own validation body carries the offending `input`, and
    on this route the offending input is a receipt (OPS-3)."""
    model.set_model_client(ScriptedClient())
    body = payload()
    body["document"]["media_type"] = "image/gif"

    response, request_id = owe1_client.request("POST", "/receipt/parse", body=body)
    opened = owe1_client.open_response(response, request_id)

    assert fixture_base64("tiny.png") not in json.dumps(opened)
    assert "document.media_type" in opened["error"]["fields"]


def test_a_missing_field_is_a_validation_failure(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient())
    body = payload()
    del body["workspace_id"]

    response, request_id = owe1_client.request("POST", "/receipt/parse", body=body)
    opened = owe1_client.open_response(response, request_id)

    assert response.status_code == 422
    assert opened["error"]["code"] == "VALIDATION_FAILED"
    assert "workspace_id" in opened["error"]["fields"]


def test_a_currency_that_is_not_a_code_is_refused(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient())

    response, request_id = owe1_client.request(
        "POST", "/receipt/parse", body=payload(workspace_currency="rp.")
    )

    assert response.status_code == 422
    owe1_client.open_response(response, request_id)


def test_no_model_configured_is_a_503_not_an_unreadable_receipt(
    owe1_client: Owe1TestClient,
) -> None:
    """A misconfiguration answered as one, so nobody retries with a
    better photograph of the same receipt."""
    model.set_model_client(None)

    response, request_id = owe1_client.request("POST", "/receipt/parse", body=payload())
    body = owe1_client.open_response(response, request_id)

    assert response.status_code == 503
    assert body["error"]["code"] == "MODEL_UNAVAILABLE"


def test_the_route_needs_the_service_key(http) -> None:
    """Service to service like every other route here (SEC-1)."""
    response = http.post("/receipt/parse", json=payload())

    assert response.status_code == 401
