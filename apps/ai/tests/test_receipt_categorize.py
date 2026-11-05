"""`POST /receipt/categorize` (D86).

A saved Telegram receipt's merchant and item names, filed under one of the
workspace's expense categories. The tests are about what the answer may
be: one of the names it was shown, exactly, or nothing. And like every
call that reads text somebody else printed, it has no tools.
"""

from __future__ import annotations

import json
from typing import Any

from app.core import model
from app.modules.extraction.categorize import clean_category
from tests.extraction_support import Answer, ScriptedClient, assert_no_tools
from tests.support import Owe1TestClient

CATEGORIES = ["🍜 Food", "🛍️ Shopping", "🧾 Bills", "🛵 Transport", "📦 Other"]


def payload(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "request_id": "01JC0TESTREQUEST",
        "workspace_id": "clxworkspace1",
        "merchant": "HOLAN BY MEVUI",
        "items": ["MINERAL WATER (Bottle)", "PHO SG - SPECIAL", "SPRITE"],
        "categories": CATEGORIES,
    }
    body.update(overrides)
    return body


def call(client: Owe1TestClient, **overrides: Any) -> dict:
    return client.call("POST", "/receipt/categorize", body=payload(**overrides))


def answer(category: Any) -> Answer:
    return Answer(text=json.dumps({"category": category}))


def test_a_category_it_was_shown_comes_back(owe1_client: Owe1TestClient) -> None:
    scripted = ScriptedClient(answer("🍜 Food"))
    model.set_model_client(scripted)

    body = call(owe1_client)

    assert body["data"]["category"] == "🍜 Food"
    assert_no_tools(scripted)


def test_a_category_it_was_not_shown_is_dropped(owe1_client: Owe1TestClient) -> None:
    """Rule 1. A reworded or invented name would not match an id in the
    API, so it never leaves here."""
    scripted = ScriptedClient(answer("Food & Drinks"))
    model.set_model_client(scripted)

    assert call(owe1_client)["data"]["category"] is None


def test_null_is_an_answer(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient(answer(None)))

    assert call(owe1_client)["data"]["category"] is None


def test_no_categories_means_no_call(owe1_client: Owe1TestClient) -> None:
    scripted = ScriptedClient(answer("🍜 Food"))
    model.set_model_client(scripted)

    body = call(owe1_client, categories=[])

    assert body["data"]["category"] is None
    assert scripted.calls == []


def test_an_answer_that_is_not_json_is_a_refusal(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient(Answer(text="Food, probably")))

    response, request_id = owe1_client.request("POST", "/receipt/categorize", body=payload())
    body = owe1_client.open_response(response, request_id)

    assert response.status_code == 422
    assert body["error"]["code"] == "CATEGORIZE_FAILED"


def test_the_model_sees_strings_and_no_document(owe1_client: Owe1TestClient) -> None:
    scripted = ScriptedClient(answer("🍜 Food"))
    model.set_model_client(scripted)

    call(owe1_client)

    content = scripted.calls[0]["messages"][0]["content"]
    assert isinstance(content, str), "the image never reaches this call"
    assert json.loads(content)["categories"] == CATEGORIES


def test_clean_category_keeps_only_an_exact_name() -> None:
    assert clean_category({"category": " 🍜 Food "}, CATEGORIES) == "🍜 Food"
    assert clean_category({"category": "food"}, CATEGORIES) is None
    assert clean_category({"category": 3}, CATEGORIES) is None
    assert clean_category({}, CATEGORIES) is None
